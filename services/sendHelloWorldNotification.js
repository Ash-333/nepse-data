import { sendPushNotification, getAllPushTokens } from './priceAlertService.js';

export async function sendHelloWorldNotification() {
  try {
    // Step 1: Get all registered push tokens
    const allTokens = await getAllPushTokens();

    if (!allTokens || allTokens.length === 0) {
      console.log("No registered tokens to send notification to.");
      return;
    }

    // Step 2: Send notification
    const tickets = await sendPushNotification(
      allTokens,
      "👋 Hello World!", // Title
      "This is a test notification from your NEPSE app.", // Body
      { type: 'hello_world', timestamp: new Date().toISOString() } // Extra data
    );

    console.log(`✅ Hello World notification sent to ${tickets.length} devices`);
  } catch (error) {
    console.error("❌ Error sending Hello World notification:", error);
  }
}
