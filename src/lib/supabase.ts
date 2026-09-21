import { createClient } from '@supabase/supabase-js';
import { PantItem, ExpenseItem, PantImage } from '../types';

const rawSupabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const rawSupabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '';

const supabaseUrl = rawSupabaseUrl || 'https://placeholder.supabase.co';
const supabaseKey = rawSupabaseKey || 'placeholder-anon-key';

if (!rawSupabaseUrl || !rawSupabaseKey) {
  console.warn('Supabase URL or Key is missing in environment variables.');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

const BUCKET_NAME = 'pant-images';

/**
 * Data URL / Base64 helper to convert to Blob
 */
export function dataURLtoBlob(dataurl: string): Blob {
  const arr = dataurl.split(',');
  const mimeMatch = arr[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

/**
 * Upload image to Supabase Storage pant-images/<userId>/<pantId>/<filename>
 */
export async function uploadPantImage(
  userId: string,
  pantId: string,
  image: PantImage
): Promise<string> {
  const fileExt = image.name?.split('.').pop() || 'jpg';
  const filename = `${image.id}.${fileExt}`;
  const filePath = `${userId}/${pantId}/${filename}`;

  let blob: Blob;
  if (image.dataUrl.startsWith('data:')) {
    blob = dataURLtoBlob(image.dataUrl);
  } else {
    // If it's already a blob url or signed URL, fetch it or skip if storagePath is present
    return image.storagePath || filePath;
  }

  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(filePath, blob, {
      contentType: blob.type || 'image/jpeg',
      upsert: true,
    });

  if (error) {
    console.error('Error uploading image to Supabase Storage:', error);
    throw error;
  }

  return filePath;
}

/**
 * Get signed URL for a single storage path (expires in 1 hour / 3600s)
 */
export async function getSignedImageUrl(storagePath: string): Promise<string | null> {
  if (!storagePath) return null;
  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .createSignedUrl(storagePath, 3600);

  if (error || !data) {
    console.error('Error creating signed URL for:', storagePath, error);
    return null;
  }

  return data.signedUrl;
}

/**
 * Get batch signed URLs for images
 */
export async function resolvePantSignedUrls(pant: PantItem): Promise<PantItem> {
  if (!pant.images || pant.images.length === 0) return pant;

  const updatedImages = await Promise.all(
    pant.images.map(async (img) => {
      if (img.storagePath) {
        const signedUrl = await getSignedImageUrl(img.storagePath);
        if (signedUrl) {
          return { ...img, dataUrl: signedUrl };
        }
      }
      return img;
    })
  );

  return { ...pant, images: updatedImages };
}

/**
 * Delete all storage images for a pant
 */
export async function deletePantImagesFromStorage(userId: string, pantId: string, images?: PantImage[]): Promise<void> {
  try {
    if (images && images.length > 0) {
      const pathsToDelete = images
        .map((img) => img.storagePath)
        .filter((path): path is string => Boolean(path));

      if (pathsToDelete.length > 0) {
        await supabase.storage.from(BUCKET_NAME).remove(pathsToDelete);
        return;
      }
    }

    // Fallback: list files in directory and delete
    const { data: fileList, error: listError } = await supabase.storage
      .from(BUCKET_NAME)
      .list(`${userId}/${pantId}`);

    if (listError || !fileList || fileList.length === 0) return;

    const filesToRemove = fileList.map((f) => `${userId}/${pantId}/${f.name}`);
    await supabase.storage.from(BUCKET_NAME).remove(filesToRemove);
  } catch (err) {
    console.error('Failed to delete storage images for pant:', pantId, err);
  }
}

/**
 * Fetch all pants for the authenticated user from public.pants
 */
export async function fetchPantsFromSupabase(userId: string): Promise<PantItem[]> {
  const { data, error } = await supabase
    .from('pants')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching pants from Supabase:', error);
    throw error;
  }

  if (!data) return [];

  const rawPants: PantItem[] = data.map((row) => {
    if (row.data) {
      const pantFromData = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
      return {
        ...pantFromData,
        id: row.id || pantFromData.id,
      };
    }
    return row as unknown as PantItem;
  });

  // Resolve signed URLs for images
  const resolvedPants = await Promise.all(rawPants.map((p) => resolvePantSignedUrls(p)));
  return resolvedPants;
}

/**
 * Save / Update pant item in public.pants and upload images to Storage
 */
export async function savePantToSupabase(userId: string, pant: PantItem): Promise<PantItem> {
  // 1. Process images: upload base64 images to Storage bucket and replace dataUrl with storagePath
  const processedImages: PantImage[] = [];

  for (const img of pant.images) {
    if (img.dataUrl.startsWith('data:')) {
      const storagePath = await uploadPantImage(userId, pant.id, img);
      const signedUrl = await getSignedImageUrl(storagePath);
      processedImages.push({
        ...img,
        storagePath,
        dataUrl: signedUrl || img.dataUrl,
      });
    } else {
      processedImages.push(img);
    }
  }

  const updatedPant: PantItem = {
    ...pant,
    images: processedImages,
    updatedAt: Date.now(),
  };

  // Strip temporary signed URLs or huge base64 dataUrls before saving to DB data column
  const pantForDb: PantItem = {
    ...updatedPant,
    images: updatedPant.images.map((img) => ({
      id: img.id,
      name: img.name,
      size: img.size,
      storagePath: img.storagePath,
      dataUrl: img.storagePath ? '' : img.dataUrl, // Keep dataUrl empty if storagePath exists
    })),
  };

  const payload = {
    id: pant.id,
    user_id: userId,
    data: pantForDb,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('pants')
    .upsert(payload, { onConflict: 'id' });

  if (error) {
    console.error('Error saving pant to Supabase:', error);
    throw error;
  }

  return updatedPant;
}

/**
 * Delete a pant from public.pants and its storage images
 */
export async function deletePantFromSupabase(userId: string, pantId: string, images?: PantImage[]): Promise<void> {
  // Delete from DB
  const { error } = await supabase
    .from('pants')
    .delete()
    .eq('id', pantId)
    .eq('user_id', userId);

  if (error) {
    console.error('Error deleting pant from Supabase:', error);
    throw error;
  }

  // Delete images from Storage bucket
  await deletePantImagesFromStorage(userId, pantId, images);
}

/**
 * Fetch all expenses from public.expenses
 */
export async function fetchExpensesFromSupabase(userId: string): Promise<ExpenseItem[]> {
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching expenses from Supabase:', error);
    throw error;
  }

  if (!data) return [];

  return data.map((row) => {
    if (row.data) {
      const expFromData = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
      return {
        ...expFromData,
        id: row.id || expFromData.id,
      };
    }
    return {
      id: row.id,
      amount: 0,
      date: new Date().toISOString().split('T')[0],
      category: 'Sonstiges',
      notes: '',
      createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    } as ExpenseItem;
  });
}

/**
 * Save an expense to public.expenses (only using columns id, user_id, data, updated_at)
 */
export async function saveExpenseToSupabase(userId: string, expense: ExpenseItem): Promise<void> {
  const payload = {
    id: expense.id,
    user_id: userId,
    data: expense,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('expenses')
    .upsert(payload, { onConflict: 'id' });

  if (error) {
    console.error('Error saving expense to Supabase:', error);
    throw error;
  }
}

/**
 * Delete an expense from public.expenses
 */
export async function deleteExpenseFromSupabase(userId: string, expenseId: string): Promise<void> {
  const { error } = await supabase
    .from('expenses')
    .delete()
    .eq('id', expenseId)
    .eq('user_id', userId);

  if (error) {
    console.error('Error deleting expense from Supabase:', error);
    throw error;
  }
}
