require('dotenv').config();
const fs = require('fs');
const xml2js = require('xml2js');
const Shopify = require('shopify-api-node');
const SFTPClient = require('ssh2-sftp-client');
const path = require('path');

// Initialize Shopify API with credentials
const shopify = new Shopify({
  shopName: process.env.SHOP_NAME,
  apiKey: process.env.SHOPIFY_API_KEY,
  password: process.env.SHOPIFY_API_PASSWORD,
});

// SFTP Configuration
const sftpConfig = {
  host: process.env.SFTP_HOST,
  port: process.env.SFTP_PORT || 22,
  username: process.env.SFTP_USERNAME,
  password: process.env.SFTP_PASSWORD,
};
const remoteDir = process.env.SFTP_ORDERSTATUS_REMOTE_DIR || '/local_order_status';
const archiveBaseDir = '/archive'; // Archive directory on the SFTP server

// Function to ensure the archive directory exists with the date structure
async function ensureArchiveDirectory(sftp, fileName) {
  const dateFolder = new Date().toISOString().split('T')[0]; // Get the current date in YYYY-MM-DD format
  const archiveDir = path.join(archiveBaseDir, dateFolder);

  try {
    const directoryExists = await sftp.exists(archiveDir);
    if (!directoryExists) {
      await sftp.mkdir(archiveDir, true);
      console.log(`Created archive directory: ${archiveDir}`);
    }
  } catch (error) {
    console.error(`Error ensuring archive directory: ${archiveDir}`, error.message);
    throw error;
  }

  return path.join(archiveDir, fileName); // Return the full path for the archived file
}

// Parse XML file
async function parseXML(filePath) {
  const parser = new xml2js.Parser();
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  return parser.parseStringPromise(fileContent);
}

// Process orders
async function processOrdersFromXML() {
  const sftp = new SFTPClient();
  try {
    // Connect to SFTP server
    await sftp.connect(sftpConfig);
    const fileList = await sftp.list(remoteDir);
    const orderStatusFiles = fileList.filter(file => file.name.startsWith('Order_Status_') && file.name.endsWith('.xml'));

    if (orderStatusFiles.length === 0) {
      console.warn('No matching files found in the remote directory.');
      return;
    }

    for (const file of orderStatusFiles) {
      const localFilePath = path.join(__dirname, file.name);
      const remoteFilePath = `${remoteDir}/${file.name}`;

      // Download the file
      await sftp.get(remoteFilePath, localFilePath);
      console.log(`Downloaded ${file.name} to ${localFilePath}`);

      // Parse the XML file
      const data = await parseXML(localFilePath);
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
          console.error(`Error processing order ${order['$']['order-no']}:`, orderError.message, orderError.stack);
        }
      }

      // Archive the processed file
      const remoteArchivePath = await ensureArchiveDirectory(sftp, file.name);
      await sftp.rename(remoteFilePath, remoteArchivePath);
      console.log(`Archived ${file.name} to ${remoteArchivePath} on SFTP server`);

      // Optionally, delete the local file after processing
      fs.unlinkSync(localFilePath);
    }
  } catch (error) {
    console.error('Error processing orders or interacting with SFTP:', error.message);
  } finally {
    await sftp.end();
  }
}

// Execute the script
processOrdersFromXML();
