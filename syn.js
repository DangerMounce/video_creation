import axios from "axios";
import chalk from "chalk";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import inquirer from 'inquirer';
import { readdir, readFile } from 'fs/promises';
import { extname, join } from 'path';
import logger from "./logger.js";
import clipboardy from 'clipboardy'

// Helper function to load environment variables
const loadEnv = () => {
    dotenv.config();
    return process.env.API_KEY;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);
const cmd = args[0]; // command
let index = args[1]; // uuid / apikey / index etc
const newTitle = args[2];
const envFile = path.resolve(process.cwd(), '.env');

// Check for .env file and create if it doesn't exist
let apiKey;
if (!fs.existsSync(envFile)) {
    logger.info('.env file not found. Creating a new one...');
    const defaultEnvContent = `API_KEY=your_api_key_here\n`;
    fs.writeFileSync(envFile, defaultEnvContent, { flag: 'wx' }, (err) => {
        if (err) {
            console.error(chalk.red('Error creating .env file:', err));
        } else {
            logger.info('.env file created with placeholder API key');
            console.log(chalk.green('.env file created successfully.'));
        }
    });
    // Load the environment variables after creating the file
    apiKey = loadEnv();
} else {
    apiKey = loadEnv();
}

// This function exists the script after a delay
function exitDelay() {
    setTimeout(async () => {
        process.exit(1);
    }, 500);
}

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
            logger.warn('Job queue is marked as a LIVE run.')
        }
        return confirmation

    } catch (error) {
        logger.error(`function isTestVideo error - ${error.message}`)
        console.error(chalk.red(`Error: ${error.message}`));
        exitAfterDelay(2000)
    }
}

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
            logger.user_message('Job aborted')
            await delay(1000)
            process.exit(1)
        } else {
            logger.user_message('Job is ok to proceed')
            await delay(500)
            return
        }
    } catch (error) {
        console.log(error)
        process.exit(1)
    }
}

async function checkApiKeyIsValid() {
    if (apiKey === 'your_api_key_here') {
        logger.error(`Valid API key not found in .env`)
        await exitDelay()
        process.exit(1)
    }
}

async function addApiKeyToEnvFile(newApiKey) {
    if (fs.existsSync(envFile)) {
        let envContent = fs.readFileSync(envFile, 'utf8');
        envContent = envContent.replace(/API_KEY=your_api_key_here/, `API_KEY=${newApiKey}`);
        fs.writeFileSync(envFile, envContent, 'utf8');
        logger.info('API key in .env file updated successfully.');
        // Reload the environment variables to use the new API key
        dotenv.config();
        apiKey = loadEnv();
    }
}

async function makeApiCall(method, endpoint, data) {
    const options = {
        method: method,
        url: `https://api.synthesia.io/v2/videos${endpoint}`,
        headers: {
            accept: 'application/json',
            Authorization: apiKey
        },
        data: data
    };

    try {
        const response = await axios.request(options);
        return response.data;
    } catch (error) {
        logger.error(`Error in API call`);
        logger.error(error);
        exitDelay();
    }
}

async function getVideoList(numberOfEntries) {
    const synthesiaVideoList = await makeApiCall("GET", `?limit=${numberOfEntries}&offset=0`);
    return synthesiaVideoList.videos
}

async function downloadVideo(url, filename) {
    const downloadsFolder = path.join(__dirname, 'downloads');

    if (!fs.existsSync(downloadsFolder)) {
        fs.mkdirSync(downloadsFolder);
    }

    const filePath = path.join(downloadsFolder, filename);
    logger.info(`Downloading video`)
    const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream'
    });
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
        logger.synthesia(`${filename} downloaded.`)
    });
}

async function downloadCaptions(url, filename) {
    const downloadsFolder = path.join(__dirname, 'downloads');

    if (!fs.existsSync(downloadsFolder)) {
        fs.mkdirSync(downloadsFolder);
    }

    const filePath = path.join(downloadsFolder, filename);
    logger.info(`Downloading VTT Captions`)
    const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream'
    });
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
        logger.synthesia(`${filename} downloaded.`)
    });
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

// This function counts the number of DOC files in the scripts directory.
async function countScriptsIn(directory) {
    try {
        const files = await readdir(directory);
        const docFiles = files.filter(file => extname(file).toLowerCase() === '.docx');
        logger.error(`${docFiles.length} script files found in ${directory} directory.`)
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

async function deleteVideo(videoUUID) {
    logger.user_message(`Delete video ${videoUUID}`)
    const url = `https://api.synthesia.io/v2/videos/${videoUUID}`;

    const response = await makeApiCall("DELETE", `/${videoUUID}`)
    logger.synthesia(response)
    logger.info(`Response suggests video has been deleted`)
}

async function processScripts() {
    const testVideo = await isTestVideo()
    // We've got all the video data we need.
    const videoData = await getVideoData();
    console.clear('')
    if (testVideo) {

        console.log(chalk.bgGreen('               TEST RUN               '))
        console.log('')
        logger.info('Job flagged as a test run')
    } else {

        console.log(chalk.white.bgRed(`               LIVE RUN              `))
        console.log('')
        logger.warn('JOB IS FLAGGED AS A LIVE RUN')
    }
    await yesOrNo(`Ready to process scripts with Synthesia?`)
    // Loops through the files in scripts
    for (let i = 0; i < videoData.length; i++) {
        await deleteDSStoreFile('scripts')
        const videoFileName = videoData[i].videoFileName
        const videoScript = videoData[i].videoScript
        logger.info(`Title added to payload is ${videoFileName}`)
        await delay(500)
        logger.info('Script added to payload')
        await delay(500)
        logger.info(`Test video status added to payload`)
        await delay(500)
        // Send the video payload
        const data = await generateSynthesiaPayload(videoFileName, videoScript, testVideo)
        logger.info('Sending payload to Synthesia.')
        await delay(500)
        const synthesiaResponse = await makeApiCall("POST", "", data)
        logger.synthesia(`createdAt: ${synthesiaResponse.createdAt}`)
        logger.synthesia(`id: ${synthesiaResponse.id}`)
        logger.synthesia(`status: ${synthesiaResponse.status}`)
        logger.synthesia(`title: ${synthesiaResponse.title}`)
        logger.synthesia(`visibility: ${synthesiaResponse.visibility}`)

        // Now we need keep checking the status of the video

        let video;
        while (true) {
            video = await getVideoStatus(synthesiaResponse.id)
            logger.synthesia(`Synthesia says video is ${video.status}.  Please wait.`)
            if (video.status === 'complete') {
                logger.synthesia(`Synthesia says that the video is complete.`)
                const fileExtension = path.extname(new URL(video.download).pathname);
                const filename = `${videoFileName}${fileExtension}`;
                logger.info(`Video filename set as ${filename}`)

                // Download the video
                await downloadVideo(video.download, filename)
                break;
            }
            await delay(120000); // wait for 120 seconds before checking again.
            logger.info('Asking Synthesia for an update.')
        }
    }
}

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function updateVideo(videoUUID, newTitleOfVideo) {
    logger.info(`Update title of video ${videoUUID} to "${newTitleOfVideo}"`);
    const data = { title: newTitleOfVideo }
    const response = await makeApiCall("PATCH", `/${videoUUID}`, data)
    logger.synthesia(`${videoUUID} title changed to "${response.title}"`)
}

async function updateVideoVisbility(videoUUID, videoVisbility) {

    const data = { visibility: videoVisbility }
    const response = await makeApiCall("PATCH", `/${videoUUID}`, data)
    logger.synthesia(`${videoUUID} visbility set to "${response.visibility}"`)
}

// This function checks for .DS_Store file and deletes it
async function deleteDSStoreFile(directory) {
    const dsStoreFilePath = path.join(directory, '.DS_Store');

    try {
        if (fs.existsSync(dsStoreFilePath)) {
            await fs.promises.unlink(dsStoreFilePath);
            logger.warn('.DS_Store file found and deleted')
            await delay(500)
        }
    } catch (error) {
        logger.warn(`Error deleting .DS_Store file: ${error.message}`)
    }
}

// This function creates the payload to send to Synthesia
async function generateSynthesiaPayload(videoFileName, videoScript, testVideo) {
    const data = {
        test: testVideo,
        visibility: 'private',
        title: videoFileName,
        input: [
            {
                avatarSettings: {
                    horizontalAlign: 'center',
                    scale: 1,
                    style: 'rectangular',
                    seamless: false,
                    voice: '398dc821-2eb9-4d93-9dca-ff6f3165906a'
                },
                backgroundSettings: {
                    videoSettings: {
                        shortBackgroundContentMatchMode: 'freeze',
                        longBackgroundContentMatchMode: 'trim'
                    }
                },
                avatar: 'fb4aeeb6-b8e2-424e-9631-3900ded817f7', // '49dc8f46-8c08-45f1-8608-57069c173827',
                background: 'workspace-media.a0f2bc02-b51f-4d88-8ea6-c42dedc078f1',
                scriptText: videoScript
            }
        ]
    };

    if (data.test) {
        logger.info(`Video is a test`)
    } else {
        logger.warn(`Video is NOT a test`)
    }
    logger.info(`Avatar ID is ${data.input[0].avatar}`)
    logger.info(`Background is ${data.input[0].background}`)
    return data
}

function copyToClipboard(text) {
    clipboardy.writeSync(text);
    logger.info('Embed code copied to clipboard');
}

// This function gets the status of the video
async function getVideoStatus(videoId) {
    try {
        const response = await makeApiCall("GET", `/${videoId}`)
        return response;
    } catch (error) {
        logger.synthesia_response(`Error in getting the video status`)
        await delay(200)
        logger.synthesia_response(error.response.data.context)
        exitDelay()
    }
}

(async () => {
    switch (cmd) {
        case `-a`:
            if (!index) {
                logger.error('API key missing')
            } else {
                await addApiKeyToEnvFile(index);
            }
            break;
        case `-l`:
            if (!index) {
                index = 100
            } else if (index === "/progress" || index === "/complete") {
                let filter = "complete"
                if (index === "/progress") {
                    filter = "in_progress"
                }
                logger.info(`Filtering by "${filter}"`)
                await checkApiKeyIsValid();
                index = 100
                const synthesiaVideoList = await getVideoList(index);
                const videoListAndIds = synthesiaVideoList.map((video, index) => ({
                    index: index + 1,
                    title: video.title,
                    id: video.id,
                    status: video.status,
                    duration: video.duration
                }));
                // videoListAndIds.forEach(entry => {
                //     logger.synthesia(`${entry.index}> ${entry.id} - ${entry.index}> "${entry.title}" (${entry.status})`)
                // })
                const filteredVideoListAndIds = videoListAndIds.filter(video => video.status === filter);

                // Check if there are no results after filtering
                if (filteredVideoListAndIds.length === 0) {
                    logger.error('No videos are currently in progress')
                } else {
                    filteredVideoListAndIds.forEach(entry => {
                        logger.synthesia(`${entry.index}> ${entry.id} - ${entry.index}> "${entry.title}" (${entry.status})`);
                    });
                }
            } else {
                await checkApiKeyIsValid();
                const synthesiaVideoList = await getVideoList(index);
                const videoListAndIds = synthesiaVideoList.map((video, index) => ({
                    index: index + 1,
                    title: video.title,
                    id: video.id,
                    status: video.status,
                    duration: video.duration
                }));
                videoListAndIds.forEach(entry => {
                    logger.synthesia(`${entry.index}> "${entry.title}" (${entry.status})`)
                })
            }

            break;
        case '-i':
            if (!index) {
                logger.error('Video index is missing')
            } else {
                await checkApiKeyIsValid()
                const synthesiaVideoList = await getVideoList(100)
                logger.synthesia(`(${index}) ${synthesiaVideoList[index - 1].title}`)
                logger.synthesia(synthesiaVideoList[index - 1].id)
                logger.synthesia(synthesiaVideoList[index - 1].status)
                logger.synthesia(synthesiaVideoList[index - 1].description)
                logger.synthesia(synthesiaVideoList[index - 1].visibility)
                if (synthesiaVideoList[index - 1].status === 'complete') {
                    logger.synthesia(synthesiaVideoList[index - 1].duration)
                    // logger.synthesia(synthesiaVideoList[index - 1].captions.vtt)
                    // logger.synthesia(synthesiaVideoList[index - 1].download)
                }
                logger.info(`Index - ${index}`)
            }
            break;
        case '-ia':
            if (!index) {
                logger.error('Video index is missing')
            } else {
                await checkApiKeyIsValid()
                const synthesiaVideoList = await getVideoList(100)
                console.log(synthesiaVideoList[index - 1])
                logger.info(`Index - ${index}`)
            }
            break;
        case '-d':
            if (!index) {
                logger.error('Video index is missing')
            } else {
                await checkApiKeyIsValid()
                const synthesiaVideoList = await getVideoList(100)
                const synthesiaVideo = synthesiaVideoList[index - 1]
                logger.synthesia(synthesiaVideo.title)
                if (synthesiaVideo.status != 'complete') {
                    logger.error(`Video status is still ${synthesiaVideo.status} - can't download right now`)
                    exitDelay()
                }
                let nameOfFile = synthesiaVideo.title.replace(/\s+/g, '')
                logger.info(`filename is "${nameOfFile}"`)
                await downloadVideo(synthesiaVideo.download, `${nameOfFile}.mp4`)
                await downloadCaptions(synthesiaVideo.captions.vtt, `${nameOfFile}.vtt`)
            }
            break;
        case '-u':
            if (!index) {
                logger.error('Video index is missing')
            } else {
                if (!newTitle) {
                    logger.error('New title of video is missing')
                } else {
                    await checkApiKeyIsValid()
                    const synthesiaVideoList = await getVideoList(100)
                    const synthesiaVideo = synthesiaVideoList[index - 1]
                    logger.synthesia(synthesiaVideo.id)
                    await updateVideo(synthesiaVideo.id, newTitle)
                }
            }
            break;
        case '-r':
            if (!index) {
                logger.error('Video index is missing')
            } else {
                await checkApiKeyIsValid()
                const synthesiaVideoList = await getVideoList(100)
                console.log(chalk.white.bgRed(`               DELETE              `))
                logger.warn(`(${index}) "${synthesiaVideoList[index - 1].title}" marked for deletion.`)
                await yesOrNo(`Are you sure you want to delete ${synthesiaVideoList[index - 1].id}?`)
                deleteVideo(synthesiaVideoList[index - 1].id)
            }
            break;
        case '-e': //embed
            if (!index) {
                logger.error('Video index is missing')
            } else {
                await checkApiKeyIsValid()
                const synthesiaVideoList = await getVideoList(100)
                logger.synthesia(`(${index}) ${synthesiaVideoList[index - 1].title}`)
                const videoId = synthesiaVideoList[index - 1].id
                await updateVideoVisbility(videoId, "public")
                const embedCode = `<div style="position: relative; overflow: hidden; aspect-ratio: 1920/1080"><iframe src="https://share.synthesia.io/embeds/videos/${videoId}" loading="lazy" title="Synthesia video player - Placeholder" allowfullscreen allow="encrypted-media; fullscreen;" style="position: absolute; width: 100%; height: 100%; top: 0; left: 0; border: none; padding: 0; margin: 0; overflow:hidden;"></iframe></div>`
                copyToClipboard(embedCode)
                logger.info(embedCode)
                logger.info(`Embed code copied to clipboard`)
            }
            break;
            case '-x': //set to private
            if (!index) {
                logger.error('Video index is missing')
            } else {
                await checkApiKeyIsValid()
                const synthesiaVideoList = await getVideoList(100)
                logger.synthesia(`(${index}) ${synthesiaVideoList[index - 1].title}`)
                const videoId = synthesiaVideoList[index - 1].id
                await updateVideoVisbility(videoId, "private")
            }
            break;
        default:
            processScripts()
            break;
    }
})();