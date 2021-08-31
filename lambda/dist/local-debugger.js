const net = require('net');
const fs = require('fs');
const localDebugger = net.createServer();
const httpHeaderDelimeter = '\r\n';
const httpBodyDelimeter = '\r\n\r\n';
const defaultHandlerName = 'handler';
const host = 'localhost';
const defaultPort = 0;
const skillInvoker = require(getAndValidateSkillInvokerFile());
const portNumber = getAndValidatePortNumber();
const lambdaHandlerName = getLambdaHandlerName();
localDebugger.listen(portNumber, host, () => {
    console.log(`Starting server on port: ${localDebugger.address().port}.`);
});
localDebugger.on('connection', (socket) => {
    console.log(`Connection from: ${socket.remoteAddress}:${socket.remotePort}`);
    socket.on('data', (data) => {
        const body = JSON.parse(data.toString().split(httpBodyDelimeter).pop());
        console.log(`Request envelope: ${JSON.stringify(body)}`);
        skillInvoker[lambdaHandlerName](body, null, (_invokeErr, response) => {
            response = JSON.stringify(response);
            console.log(`Response envelope: ${response}`);
            socket.write(`HTTP/1.1 200 OK${httpHeaderDelimeter}Content-Type: application/json;charset=UTF-8${httpHeaderDelimeter}Content-Length: ${response.length}${httpBodyDelimeter}${response}`);
        });
    });
});
function getAndValidatePortNumber() {
    const portNumberArgument = Number(getArgument('portNumber', defaultPort));
    if (!Number.isInteger(portNumberArgument)) {
        throw new Error(`Port number has to be an integer - ${portNumberArgument}.`);
    }
    if (portNumberArgument < 0 || portNumberArgument > 65535) {
        throw new Error(`Port out of legal range: ${portNumberArgument}. The port number should be in the range [0, 65535]`);
    }
    if (portNumberArgument === 0) {
        console.log('The TCP server will listen on a port that is free.'
            + 'Check logs to find out what port number is being used');
    }
    return portNumberArgument;
}
function getLambdaHandlerName() {
    return getArgument('lambdaHandler', defaultHandlerName);
}
function getAndValidateSkillInvokerFile() {
    const fileNameArgument = getArgument('skillEntryFile');
    if (!fs.existsSync(fileNameArgument)) {
        throw new Error(`File not found: ${fileNameArgument}`);
    }
    return fileNameArgument;
}
function getArgument(argumentName, defaultValue) {
    const index = process.argv.indexOf(`--${argumentName}`);
    if (index === -1 || typeof process.argv[index + 1] === 'undefined') {
        if (defaultValue === undefined) {
            throw new Error(`Required argument - ${argumentName} not provided.`);
        }
        else {
            return defaultValue;
        }
    }
    return process.argv[index + 1];
}
