// Sascha AI Content Script
// Communicates with Sascha AI web app via postMessage bridge

(function () {
  console.log("Sascha AI Extension Content Script active.");

  // Listen for requests from popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    let hasResponded = false;

    if (request.type === "FETCH_DRAFT_LIST_FROM_SASCHA") {
      const handleResponse = (event) => {
        if (
          event.source === window &&
          event.data &&
          event.data.source === "sascha-ai" &&
          event.data.type === "VINTED_DRAFT_LIST"
        ) {
          if (timer) clearTimeout(timer);
          window.removeEventListener("message", handleResponse);

          if (!hasResponded) {
            hasResponded = true;
            if (event.data.error) {
              sendResponse({ success: false, error: event.data.error });
            } else {
              sendResponse({
                success: true,
                payload: event.data.payload || [],
              });
            }
          }
        }
      };

      window.addEventListener("message", handleResponse);

      // Timeout safety (3 seconds)
      const timer = setTimeout(() => {
        window.removeEventListener("message", handleResponse);
        if (!hasResponded) {
          hasResponded = true;
          sendResponse({
            success: false,
            error: "Keine Antwort von Sascha AI erhalten.",
          });
        }
      }, 3000);

      // Send postMessage request to Sascha AI page
      window.postMessage(
        {
          source: "sascha-ai-extension",
          type: "LIST_VINTED_DRAFTS",
          includeEligiblePants: request.includeEligiblePants === true,
        },
        "*"
      );

      return true; // Async response
    }

    if (request.type === "REQUEST_VINTED_DRAFT_FROM_SASCHA") {
      const targetDraftId = request.draftId || null;

      const handleResponse = (event) => {
        if (
          event.source === window &&
          event.data &&
          event.data.source === "sascha-ai" &&
          event.data.type === "VINTED_DRAFT_DATA"
        ) {
          if (timer) clearTimeout(timer);
          window.removeEventListener("message", handleResponse);

          if (!hasResponded) {
            hasResponded = true;
            if (event.data.error) {
              sendResponse({ success: false, error: event.data.error });
            } else {
              sendResponse({
                success: true,
                payload: event.data.payload,
                draftId: event.data.draftId,
              });
            }
          }
        }
      };

      window.addEventListener("message", handleResponse);

      // Four photos may require fresh Supabase URLs and data:image hydration.
      // The original 3s limit caused intermittent failures during batches.
      const timer = setTimeout(() => {
        window.removeEventListener("message", handleResponse);
        if (!hasResponded) {
          hasResponded = true;
          sendResponse({
            success: false,
            error: "Sascha AI brauchte länger als 45 Sekunden zum Laden der Fotos.",
          });
        }
      }, 45000);

      // Send postMessage request to Sascha AI page
      window.postMessage(
        {
          source: "sascha-ai-extension",
          type: "GET_VINTED_DRAFT",
          draftId: targetDraftId,
        },
        "*"
      );

      return true; // Async response
    }
  });
})();
