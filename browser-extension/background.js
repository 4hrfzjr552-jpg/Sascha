// Sascha AI -> Vinted Assistant MV3 background service worker.
// Batch mode lives here rather than in popup.js: the popup can close.
importScripts("vinted-batch.js");

chrome.runtime.onInstalled.addListener(() => {
  console.log("Sascha AI -> Vinted Assistant Extension installed.");
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request?.type !== "PING") return false;
  sendResponse({ status: "PONG" });
  return false;
});
