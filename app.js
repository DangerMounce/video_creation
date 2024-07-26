// This script will take in a value of true or false for testing.
// It'll go through each of the scripts in the script dir
// It'll send through the script to the synthesia API
// Once done, it'll use the script filename to name the video and download it to downloads.

import axios from "axios";
import chalk from "chalk";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import inquirer from 'inquirer'
import { readdir, readFile } from 'fs/promises';
import { extname, join } from 'path';
import logger from "./logger.js";


// Load environment variables from .env file
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiKey = process.env.API_KEY;
const apiURL = 'https://api.synthesia.io/v2/videos';

// This function confirms if video should be a test
async function isTestVideo() {
    console.clear('')
    try {
        const answers = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'confirmation',
                message: chalk.bold.yellow('Mark this run as drafts?'),
                default: true // Set default value as needed
            }
        ]);

        const confirmation = answers.confirmation;
        if (confirmation) {
            logger.info('Job queue is marked as a test run.')
        } else {
            logger.warn('Job queue is marked as a live run.')
        }
        return confirmation

    } catch (error) {
        logger.error(`function isTestVideo error - ${error.message}`)
        console.error(chalk.red(`Error: ${error.message}`));
        exitAfterDelay(2000)
    }
}

// This function counts the number of DOC files in the scripts directory.
async function countScriptsIn(directory) {
    try {
        const files = await readdir(directory);
        const docFiles = files.filter(file => extname(file).toLowerCase() === '.docx');
        logger.info(`${docFiles.length} script files found in ${directory} directory.`)
        logger.info(`countScriptsIn(${directory}) - ${docFiles.length} returned`)
        return docFiles.length;
    } catch (error) {
        logger.error(`function countScriptsIn error - ${error}`)
        console.error('Error reading directory:', error);
        exitAfterDelay(2000)
        return 0;
    }
}

// This function reads the scripts from each DOCX file.
async function readScripts(directory) {
    const numberOfScripts = await countScriptsIn(directory)
    if (numberOfScripts === 0) {
        console.log(chalk.red(`${numberOfScripts} found in scripts directory.`))
        process.exit(1)
    } else {
        try {
            const files = await readdir(directory);
            const scripts = [];

            for (const file of files) {
                const filePath = join(directory, file);
                const content = await readFile(filePath, 'utf-8');
                scripts.push({ fileName: file, script: content });
            }

            return scripts;
        } catch (error) {
            logger.error(`function readScripts error - ${error}`)
            console.error('Error reading directory or files:', error);
            return [];
        }
    }
}

// This function return an array of objects with the video filename and the script for each file contained in scripts.
async function getVideoData() {
    const data = await readScripts('scripts')
    return data.map(item => {
        const videoFileName = item.fileName.replace(/\.docx$/, ''); // Remove the .docx extension
        return {
            videoFileName: videoFileName,
            videoScript: item.script
        };
    });
}

// Function to prompt the user for a Yes or No response
async function yesOrNo(question) {
    console.log('')
    try {
        const answers = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'confirmation',
                message: chalk.bold.yellow(question),
                default: false // Set default value as needed
            }
        ]);

        const confirmation = answers.confirmation;
        if (!confirmation) {
            process.exit(1)
        } else {
            logger.info('User has confirmed job ok to process.')
            return
        }
    } catch (error) {
        console.log(error)
        process.exit(1)
    }
}

// This function creates the payload to send to Synthesia
async function generateSynthesiaPayload(videoFileName, videoScript, testVideo) {
    return {
        test: testVideo,
        visibility: 'private',
        title: videoFileName,
        input: [
            {
                avatarSettings: { horizontalAlign: 'center', scale: 1, style: 'rectangular', seamless: false },
                backgroundSettings: {
                    videoSettings: {
                        shortBackgroundContentMatchMode: 'freeze',
                        longBackgroundContentMatchMode: 'trim'
                    }
                },
                avatar: '49dc8f46-8c08-45f1-8608-57069c173827',
                background: 'workspace-media.a0f2bc02-b51f-4d88-8ea6-c42dedc078f1',
                scriptText: videoScript
            }
        ]
    };
}

// This function sends the payload to Synthesia to create the video.
async function sendPayloadToSynthesia(videoData) {
    try {
        const response = await axios.post(apiURL, videoData, {
            headers: {
                accept: 'application/json',
                'content-type': 'application/json',
                Authorization: apiKey
            }
        });
        return response.data;
    } catch (error) {
        console.error('Error creating video:', error);
        throw error;
    }
}

// This function gets the status of the video
async function getVideoStatus(videoId) {
    try {
        const response = await axios.get(`${apiURL}/${videoId}`, {
            headers: {
                accept: 'application/json',
                Authorization: apiKey
            }
        });
        return response.data;
    } catch (error) {
        console.error('Error getting video status:', error);
        throw error;
    }
}

// This function exists the script after a delay
function exitAfterDelay(delay) {
    setTimeout(async () => {
        process.exit(1);
    }, delay);
}

async function downloadVideo(url, filename) {
    const downloadsFolder = path.join(__dirname, 'downloads');

    if (!fs.existsSync(downloadsFolder)) {
        fs.mkdirSync(downloadsFolder);
    }

    const filePath = path.join(downloadsFolder, filename);

    const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream'
    });
    logger.info(`${filename} downloaded.`)
    return new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(filePath);
        response.data.pipe(writer);
        let error = null;
        writer.on('error', err => {
            error = err;
            writer.close();
            reject(err);
        });
        writer.on('close', () => {
            if (!error) {
                resolve();
            }
        });
    });
}


const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function processScripts() {
    const testVideo = await isTestVideo()
    // We've got all the video data we need.
    const videoData = await getVideoData();
    console.clear('')
    if (testVideo) {
        console.log(chalk.bold.green(`\(^-^)/ Test video job \(^-^)/`))
    } else {
        console.log(chalk.bold.red(`WARNING: 【ツ】 LIVE VIDEO JOB 【ツ】` ))
    }
    await yesOrNo(`Ready to process scripts with Synthesia?`)

    // Loops through the files in scripts
    for (let i = 0; i < videoData.length; i++) {
        const videoFileName = videoData[i].videoFileName
        const videoScript = videoData[i].videoScript
        logger.info(`Title added to payload is ${videoFileName}`)
        logger.info('Script added to payload')
        logger.info(`Test video status added to payload`)
        logger.info('Sending payload to Synthesia.')
        // Send the video payload
        const data = await generateSynthesiaPayload(videoFileName, videoScript, testVideo)
        const synthesiaResponse = await sendPayloadToSynthesia(data)
        logger.response(`createdAt: ${synthesiaResponse.createdAt}`)
        logger.response(`id: ${synthesiaResponse.id}`)
        logger.response(`status: ${synthesiaResponse.status}`)
        logger.response(`title: ${synthesiaResponse.title}`)
        logger.response(`visibility: ${synthesiaResponse.visibility}`)

        // Now we need keep checking the status of the video

        let video;
        while (true) {
            video = await getVideoStatus(synthesiaResponse.id)
            logger.response(`Synthesia says video is ${video.status}`)
            if (video.status === 'complete') {
                logger.response(`Synthesia says that the video is complete.`)
                logger.response(`Download link is ${video.download}`)
                const fileExtension = path.extname(new URL(video.download).pathname);
                const filename = `${videoFileName}${fileExtension}`;
                logger.info(`Video filename set as ${filename}`)

                // Download the video
                await downloadVideo(video.download, filename)
                break;
            }
            logger.info(`Checking again in 120 seconds.`)
            await delay(120000); // wait for 120 seconds before checking again.
        }
    }
}

// const synthesiaResponse = {
//     createdAt: 1721993687,
//     id: '6446da43-d605-4e4f-a3b6-03cfacb9ef18',
//     lastUpdatedAt: 1721993688,
//     status: 'in_progress',
//     title: 'test',
//     visibility: 'private'
// }


// const completedVid = {
//     createdAt: 1721999851
//     download: 'https://synthesia-ttv-data.s3.amazonaws.com/video_data/394ba5c5-4b40-4a6f-aa1d-d45a761e5862/transfers/rendered_video.mp4?response-content-disposition=attachment%3Bfilename%3D%22test.mp4%22&AWSAccessKeyId=AKIA32NGJ5TSTZY6HDVC&Signature=smgzy0t90dZXfuCPoyXFKuKv2lA%3D&Expires=1722021818',
//     duration: '0:00:06.605',
//     id: '394ba5c5-4b40-4a6f-aa1d-d45a761e5862',
//     lastUpdatedAt: 1721999917,
//     status: 'complete',
//     title: 'test',
//     visibility: 'private'
// }

// const pendingVid = {
//     createdAt: 1722000327,
//     id: '5fde989f-6e09-4bf0-9f8c-3a3d416c78c1',
//     lastUpdatedAt: 1722000333,
//     status: 'in_progress',
//     title: 'test',
//     visibility: 'private'
// }


processScripts()

// const videoStatus = await getVideoStatus('5fde989f-6e09-4bf0-9f8c-3a3d416c78c1')
// logger.response(`Video status is: ${videoStatus.status}`)
// console.log(videoStatus)