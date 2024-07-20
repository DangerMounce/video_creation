import logUpdate from 'log-update'
import chalk from 'chalk';

let message = ''
let index = 0;
let intervalId;

const frames = [
    "▰▱▱▱▱▱▱",
    "▰▰▱▱▱▱▱",
    "▰▰▰▱▱▱▱",
    "▰▰▰▰▱▱▱",
    "▰▰▰▰▰▱▱",
    "▰▰▰▰▰▰▱",
    "▰▰▰▰▰▰▰",
    "▰▱▱▱▱▱▱"
]

const generatingVideoAnimation = () => {
    intervalId = setInterval(() => {
        const frame = frames[index = ++index % frames.length];

        logUpdate(chalk.bold.yellow(`Generating Video ${frame}`)
        );
    }, 80);
};

const stopAnimation = () => {
    clearInterval(intervalId);
    logUpdate.clear(); // This clears the last update from the console if you are using log-update library
};

export const spinner = {
    generatingVideoAnimation,
    stopAnimation
}