"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const Alexa = __importStar(require("ask-sdk-core"));
const AWS = __importStar(require("aws-sdk"));
const Adapter = __importStar(require("ask-sdk-dynamodb-persistence-adapter"));
const unsplash_js_1 = require("unsplash-js");
const node_fetch_1 = __importDefault(require("node-fetch"));
const otplib_1 = require("otplib");
const fs = require("fs");
const { pipeline } = require("stream");
const { promisify } = require("util");
const tfnode = require("@tensorflow/tfjs-node");
const mobilenet = require("@tensorflow-models/mobilenet");
const secret = "KVKFKRCPNZQUYMLXOVYDSQKJKZDTSRLD";
async function downloadImage(url, name) {
    const streamPipeline = promisify(pipeline);
    const response = await node_fetch_1.default(url);
    if (!response.ok)
        throw new Error(`unexpected response ${response.statusText}`);
    const tmpPath = `./tmp`;
    const filePath = `${tmpPath}/${name}-${Date.now()}.jpeg`;
    try {
        if (!fs.existsSync(tmpPath)) {
            fs.mkdirSync(tmpPath);
        }
    }
    catch (err) {
        console.error(err);
    }
    await streamPipeline(response.body, fs.createWriteStream(filePath));
    return filePath;
}
async function classifyImage(filePath) {
    const image = fs.readFileSync(filePath);
    const decodedImage = tfnode.node.decodeImage(image, 3);
    const model = await mobilenet.load();
    return await model.classify(decodedImage);
}
const LaunchRequestHandler = {
    canHandle(handlerInput) {
        return (Alexa.getRequestType(handlerInput.requestEnvelope) === "LaunchRequest");
    },
    async handle(handlerInput) {
        const speakOutput = 'Bem vindo ao Procure Uma Imagem. Você pode dizer: "Procure uma imagem do Will Smith", por exemplo.';
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    },
};
const LinkTelegramIntentHandler = {
    canHandle(handlerInput) {
        return (Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
            Alexa.getIntentName(handlerInput.requestEnvelope) === "LinkTelegramIntent");
    },
    async handle(handlerInput) {
        const deviceId = Alexa.getDeviceId(handlerInput.requestEnvelope);
        const token = otplib_1.totp.generate(secret);
        const attributesManager = handlerInput.attributesManager;
        const attributes = await attributesManager.getPersistentAttributes();
        const telegramTokens = attributes.telegramTokens || {};
        attributesManager.setPersistentAttributes(Object.assign(Object.assign({}, attributes), { telegramTokens: Object.assign(Object.assign({}, telegramTokens), { [deviceId]: token }) }));
        await attributesManager.savePersistentAttributes();
        const speakOutput = `Envie este código para o @ProcureUmaImagemBot no Telegram: ${token}`;
        return handlerInput.responseBuilder.speak(speakOutput).getResponse();
    },
};
const ImageSearchIntentHandler = {
    canHandle(handlerInput) {
        return (Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
            Alexa.getIntentName(handlerInput.requestEnvelope) === "ImageSearchIntent");
    },
    async handle(handlerInput) {
        var _a, _b;
        const deviceId = Alexa.getDeviceId(handlerInput.requestEnvelope);
        const imagem = Alexa.getSlotValue(handlerInput.requestEnvelope, "imagem");
        let speakOutput = `Certo, te enviei algumas imagens de ${imagem}`;
        const attributesManager = handlerInput.attributesManager;
        const attributes = await attributesManager.getPersistentAttributes();
        const telegramToken = (_a = attributes.telegramTokens) === null || _a === void 0 ? void 0 : _a[deviceId];
        let telegramId = (_b = attributes.linkedDevices) === null || _b === void 0 ? void 0 : _b[deviceId];
        const isDeviceLinked = !!telegramId;
        if (!isDeviceLinked) {
            if (telegramToken) {
                const telegramBotUpdates = await node_fetch_1.default("https://api.telegram.org/bot1640712401:AAHzl6qTlb3tGWP_DpHE1K_lx8nI86PMLWY/getUpdates");
                const { result: telegramResponse } = await telegramBotUpdates.json();
                for (const result of telegramResponse) {
                    const { text, chat } = result.message;
                    telegramId = chat.id;
                    if (text.trim() === telegramToken) {
                        attributesManager.setPersistentAttributes(Object.assign(Object.assign({}, attributes), { linkedDevices: {
                                [deviceId]: telegramId,
                            } }));
                        await attributesManager.savePersistentAttributes();
                        break;
                    }
                }
            }
            else {
                speakOutput = `Hmm, não encontrei seu código do Telegram, tem certeza que digitou correto? O código é: ${telegramToken}`;
                return handlerInput.responseBuilder.speak(speakOutput).getResponse();
            }
        }
        const unsplash = unsplash_js_1.createApi({
            accessKey: "s0wfQxfDB-DbURyOncr9Ej30wLgebwY7T8hM2JRsQCI",
            fetch: node_fetch_1.default,
        });
        const { response: unsplashResponse } = await unsplash.search.getPhotos({
            query: imagem,
            page: 1,
            perPage: 3,
            lang: unsplash_js_1.Language.Portuguese,
        });
        console.log("unsplashresponse", unsplashResponse);
        const downloadPromises = unsplashResponse.results.map((result) => {
            const url = result.urls.regular;
            const name = result.id;
            return downloadImage(url, name);
        });
        const downloaded = await Promise.all(downloadPromises);
        const predictionsPromises = downloaded.map((filePath) => classifyImage(filePath));
        const predictions = await Promise.all(predictionsPromises);
        console.log('predictions', predictions);
        const sendPhotoPromises = unsplashResponse.results.map((result, index) => {
            return node_fetch_1.default("https://api.telegram.org/bot1640712401:AAHzl6qTlb3tGWP_DpHE1K_lx8nI86PMLWY/sendPhoto", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chat_id: telegramId,
                    photo: result.urls.regular,
                    caption: `Description: ${result.alt_description}\n\nPrediction: ${predictions[index][0].className}\n\nProbability: ${predictions[index][0].probability}`,
                }),
            });
        });
        await Promise.all(sendPhotoPromises);
        return handlerInput.responseBuilder.speak(speakOutput).getResponse();
    },
};
const FallbackIntentHandler = {
    canHandle(handlerInput) {
        return (Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
            Alexa.getIntentName(handlerInput.requestEnvelope) ===
                "AMAZON.FallbackIntent");
    },
    handle(handlerInput) {
        console.log(handlerInput);
        const speakOutput = 'Desculpe, não entendi essa. Tente dizer: "Procure uma imagem de cachorro';
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    },
};
const SessionEndedRequestHandler = {
    canHandle(handlerInput) {
        return (Alexa.getRequestType(handlerInput.requestEnvelope) ===
            "SessionEndedRequest");
    },
    handle(handlerInput) {
        console.log(`~~~~ Session ended: ${JSON.stringify(handlerInput.requestEnvelope)}`);
        return handlerInput.responseBuilder.getResponse();
    },
};
const IntentReflectorHandler = {
    canHandle(handlerInput) {
        return (Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest");
    },
    handle(handlerInput) {
        const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
        const speakOutput = `You just triggered ${intentName} +=+=`;
        return (handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse());
    },
};
const ErrorHandler = {
    canHandle() {
        return true;
    },
    handle(handlerInput, error) {
        const speakOutput = "Desculpe, tive dificuldades para fazer o que você pediu. Por favor, tente novamente.";
        console.log(`~~~~ Error handled: ${JSON.stringify(error)}`);
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    },
};
const LogRequestInterceptor = {
    process(handlerInput) {
    },
};
const LogResponseInterceptor = {
    process(handlerInput, response) {
    },
};
exports.handler = Alexa.SkillBuilders.custom()
    .addRequestHandlers(LaunchRequestHandler, ImageSearchIntentHandler, LinkTelegramIntentHandler, FallbackIntentHandler, SessionEndedRequestHandler, IntentReflectorHandler)
    .addErrorHandlers(ErrorHandler)
    .withCustomUserAgent("sample/hello-world/v1.2")
    .withPersistenceAdapter(new Adapter.DynamoDbPersistenceAdapter({
    tableName: "procure-uma-imagem",
    createTable: true,
    dynamoDBClient: new AWS.DynamoDB({
        apiVersion: "latest",
        region: "us-east-1",
        credentials: {
            accessKeyId: "AKIASKVGLJANT7KI3GHU",
            secretAccessKey: "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",
        },
    }),
}))
    .addRequestInterceptors(LogRequestInterceptor)
    .addResponseInterceptors(LogResponseInterceptor)
    .lambda();
