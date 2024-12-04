const fs = require('fs');
const path = require('path');
const Client = require('ssh2-sftp-client');
const csv = require('fast-csv');
const { exec } = require('child_process');

// Environment Variables
const SFTP_CONFIG = {
  host: process.env.SFTP_HOST,
  port: process.env.SFTP_PORT,
  username: process.env.SFTP_USER,
  password: process.env.SFTP_PASSWORD,
};
const REMOTE_DIR = process.env.SFTP_PRODUCT_REMOTE_DIR || '/E:/SFTP/ECOMMERCE/Shopify/catalog';
const ARCHIVE_DIR = path.join(__dirname, 'archive');
const SHOPIFY_API_KEYS = process.env.SHOPIFY_API_KEYS.split(',');

// Step 1: Download files from SFTP
async function downloadFiles() {
  const sftp = new Client();
  try {
    await sftp.connect(SFTP_CONFIG);
    const files = await sftp.list(REMOTE_DIR, 'MS_SHOPIFY_*.zip');
    if (!files.length) {
      console.log('No files to process.');
      return;
    }

    for (const file of files) {
      const localPath = path.join(__dirname, file.name);
      await sftp.get(path.join(REMOTE_DIR, file.name), localPath);
      console.log(`Downloaded: ${file.name}`);
      processFile(localPath);
    }
  } catch (err) {
    console.error('SFTP Error:', err);
  } finally {
    sftp.end();
  }
}

// Step 2: Extract ZIP files
function extractZip(filePath) {
  // Code to extract ZIP file and return extracted directory path
}

// Step 3: Process CSV Files
function processCSV(csvPath) {
  // Logic to parse and process CSV file
  // Use Shopify API for product import/update
}

// Step 4: Handle Multi-Processing
function startMultiProcessing(taskFunc, dataList) {
  const numProcesses = Math.min(dataList.length, 25); // Limit to 25
  const processes = [];
  for (let i = 0; i < numProcesses; i++) {
    processes.push(
      new Promise((resolve, reject) => {
        const worker = exec(`node worker.js ${taskFunc} ${dataList[i]}`, (err, stdout, stderr) => {
          if (err) reject(err);
          else resolve(stdout);
        });
      })
    );
  }
  return Promise.all(processes);
}

// Step 5: Archive Files
function archiveFile(filePath) {
  const archivePath = path.join(ARCHIVE_DIR, new Date().toISOString().split('T')[0]);
  if (!fs.existsSync(archivePath)) {
    fs.mkdirSync(archivePath, { recursive: true });
  }
  const newPath = path.join(archivePath, path.basename(filePath));
  fs.renameSync(filePath, newPath);
  console.log(`Archived: ${newPath}`);
}

// Run Task
(async () => {
  await downloadFiles();
})();
