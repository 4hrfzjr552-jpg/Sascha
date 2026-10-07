// Sascha AI Content Script
// Communicates with Sascha AI web app via postMessage bridge

(function () {
  console.log("Sascha AI Extension Content Script active.");

  // Listen for requests from popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "REQUEST_VINTED_DRAFT_FROM_SASCHA") {
      const targetDraftId = request.draftId || null;

      const handleResponse = (event) => {
        if (
          event.source === window &&
          event.data &&
          event.data.source === "sascha-ai" &&
          event.data.type === "VINTED_DRAFT_DATA"
        ) {
          window.removeEventListener("message", handleResponse);

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
      };

      window.addEventListener("message", handleResponse);

      // Timeout safety (3 seconds)
      setTimeout(() => {
        window.removeEventListener("message", handleResponse);
      }, 3000);

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
