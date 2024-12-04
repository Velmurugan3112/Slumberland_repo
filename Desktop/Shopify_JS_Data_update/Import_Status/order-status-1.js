require('dotenv').config();
const fs = require('fs');
const xml2js = require('xml2js');
const Shopify = require('shopify-api-node');
 
const shopify = new Shopify({
  shopName: process.env.SHOP_NAME,
  apiKey: process.env.SHOPIFY_API_KEY,
  password: process.env.SHOPIFY_API_PASSWORD,
});
 
// Parse XML file
async function parseXML(filePath) {
  const parser = new xml2js.Parser();
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  return parser.parseStringPromise(fileContent);
}
 
// Process orders
async function processOrdersFromXML() {
  try {
    const xmlFilePath = './sample.xml';
    const data = await parseXML(xmlFilePath);
 
    const orders = data.orders.order;
 
    for (const order of orders) {
      try {
        const orderNo = order['$']['order-no'];
        const orderStatus = order.status[0]['order-status'][0];
        console.log('Order No:', orderNo);
        console.log('Order Status:', orderStatus);
 
        if (orderStatus === 'COMPLETED') {
          console.log(`Processing order: ${orderNo}`);
 
          const shopifyOrders = await shopify.order.list({ name: `#${orderNo}` });
          //console.log('Shopify Orders:', shopifyOrders);
 
          if (shopifyOrders.length > 0) {
            const shopifyOrder = shopifyOrders[0];
            const fulfillmentDetails = await shopify.order.fulfillmentOrders(shopifyOrder.id);
            console.log('Fulfillment Details:', fulfillmentDetails);
 
            const fulfillmentOrderId = fulfillmentDetails[0]?.id;
            const fulfillmentLineitemIds = fulfillmentDetails[0]?.line_items.map(item => ({
              id: item.id,
              quantity: item.quantity,
            }));
 
            if (fulfillmentOrderId && fulfillmentLineitemIds.length > 0) {
              console.log('Fulfillment Order ID:', fulfillmentOrderId);
              console.log('Fulfillment Line Items:', fulfillmentLineitemIds);
 
              const updateParams = {
                line_items_by_fulfillment_order: [
                  {
                    fulfillment_order_id: fulfillmentOrderId,
                    fulfillment_order_line_items: fulfillmentLineitemIds,
                  },
                ],
                notify_customer: true,
              };
 
              await shopify.fulfillment.createV2(updateParams);
              console.log(`Order ${orderNo} fulfilled successfully.`);
            } else {
              console.log(`Invalid fulfillment details for order: ${orderNo}`);
            }
          } else {
            console.log(`Shopify order not found for order-no: ${orderNo}`);
          }
        }
      } catch (orderError) {
        // Log the error for the specific order and continue
        console.error(`Error processing order ${order['$']['order-no']}:`, orderError.message, orderError.response?.body || orderError.stack);
      }
    }
  } catch (error) {
    console.error('Error reading XML file or initializing process:', error.message, error.stack);
  }
}
 
// Execute the script
processOrdersFromXML();