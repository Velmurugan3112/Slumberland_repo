require('dotenv').config();
const SFTPClient = require('ssh2-sftp-client');
const sftp = new SFTPClient();

sftp.on('debug', (msg) => console.log('[SFTP Debug]', msg));
const sftpConfig = {
    host: process.env.SFTP_HOST,
    port: Number(process.env.SFTP_PORT), // Ensure port is a number
    username: process.env.SFTP_USERNAME,
    password: process.env.SFTP_PASSWORD,
};

async function fetchFilesFromSFTP() {
    try {
        console.log({
            host: process.env.SFTP_HOST,
            port: process.env.SFTP_PORT,
            username: process.env.SFTP_USERNAME,
            password: process.env.SFTP_PASSWORD,
            directory: process.env.SFTP_DIRECTORY,
        });
        
        await sftp.connect(sftpConfig);
        console.log('Connected to SFTP server');
        const fileList = await sftp.list(process.env.SFTP_DIRECTORY);
        console.log('File list:', fileList);
    } catch (error) {
        console.error('SFTP Error:', error.message);
    } finally {
        await sftp.end();
    }
}

fetchFilesFromSFTP();
