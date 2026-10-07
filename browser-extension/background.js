// Sascha AI -> Vinted Assistant Background Service Worker

chrome.runtime.onInstalled.addListener(() => {
  console.log("Sascha AI -> Vinted Assistant Extension installed.");
});

// Relay messages between scripts if needed
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "PING") {
    sendResponse({ status: "PONG" });
  }
  return true;
});
