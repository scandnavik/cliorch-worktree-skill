// src/router/askApproval.js
const readline = require('readline');

function askApproval(promptMessage) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        rl.question(`${promptMessage} (y/n/yes/no): `, (answer) => {
            rl.close();
            const lower = answer.trim().toLowerCase();
            resolve(lower === 'y' || lower === 'yes');
        });
    });
}

module.exports = { askApproval };
