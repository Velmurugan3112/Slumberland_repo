const fs = require('fs');
const xml2js = require('xml2js');
const Shopify = require('shopify-api-node');

// Initialize Shopify API Client
const shopify = new Shopify({
  shopName: 'quickstart-b9f71c6f.myshopify.com',
  apiKey: '5c4be99b617706627d8db961a02a4368',
  password: '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'
});

// Parse XML file
async function parseXML(filePath) {
  const parser = new xml2js.Parser();
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  return parser.parseStringPromise(fileContent);
}

// Fulfill Shopify orders based on XML data
async function processOrdersFromXML(filePath) {
  try {
    // Parse the XML file
    const data = await parseXML(filePath);

    // Extract order details
    const orders = data.orders.order; // Adjust based on the XML structure

    for (const order of orders) {
      const orderNo = order['$']['order-no']; // Get the order number
      const orderStatus = order.status[0]['order-status'][0];

      if (orderStatus === 'COMPLETED') {
        console.log(`Processing order: ${orderNo}`);

        // Find the Shopify order by name (Shopify's order name is prefixed with #)
        const shopifyOrders = await shopify.order.list({ name: `#${orderNo}` });

        if (shopifyOrders.length > 0) {
          const shopifyOrder = shopifyOrders[0];

          // Fetch fulfillment orders
          const fulfillmentDetails = await shopify.order.fulfillmentOrders(shopifyOrder.id);
          const fulfillmentOrderId = fulfillmentDetails[0].id;

          // Prepare line items for fulfillment
          const fulfillmentLineitemIds = fulfillmentDetails[0].line_items.map(item => ({
            id: item.id,
            quantity: item.quantity
          }));

          // Create fulfillment
          const updateParams = {
            line_items_by_fulfillment_order: [
              {
                fulfillment_order_id: fulfillmentOrderId,
                fulfillment_order_line_items: fulfillmentLineitemIds
              }
            ],
            notify_customer: true
          };

          await shopify.fulfillment.createV2(updateParams);
          console.log(`Order ${orderNo} fulfilled successfully.`);
        } else {
          console.log(`Shopify order not found for order-no: ${orderNo}`);
        }
      }
    }
  } catch (error) {
    console.error('Error processing orders:', error.message);
  }
}

// Example usage
const xmlFilePath = './order copy.xml'; // Replace with the actual file path
processOrdersFromXML(xmlFilePath);
