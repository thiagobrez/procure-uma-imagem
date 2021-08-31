/* *
 * This sample demonstrates handling intents from an Alexa skill using the Alexa Skills Kit SDK (v2).
 * Please visit https://alexa.design/cookbook for additional examples on implementing slots, dialog management,
 * session persistence, api calls, and more.
 * */

import * as Alexa from "ask-sdk-core";
import {
  ErrorHandler,
  HandlerInput,
  RequestHandler,
  SkillBuilders,
} from "ask-sdk-core";
import { Response, SessionEndedRequest } from "ask-sdk-model";
import * as AWS from "aws-sdk";
import * as Adapter from "ask-sdk-dynamodb-persistence-adapter";
import { createApi, Language } from "unsplash-js";
import fetch from "node-fetch";
import { totp } from "otplib";
import { Predictions } from "types";
const fs = require("fs");
const { pipeline } = require("stream");
const { promisify } = require("util");
const tfnode = require("@tensorflow/tfjs-node");
const mobilenet = require("@tensorflow-models/mobilenet");

const secret = "KVHFQRSPNZQUYMLXOVYDDQKJKTDTSRLA";

async function downloadImage(url: string, name: string) {
  const streamPipeline = promisify(pipeline);

  const response = await fetch(url);

  if (!response.ok)
    throw new Error(`unexpected response ${response.statusText}`);

  const tmpPath = `./tmp`;
  const filePath = `${tmpPath}/${name}-${Date.now()}.jpeg`;

  try {
    if (!fs.existsSync(tmpPath)) {
      fs.mkdirSync(tmpPath);
    }
  } catch (err) {
    console.error(err);
  }

  await streamPipeline(response.body, fs.createWriteStream(filePath));

  return filePath;
}

async function classifyImage(filePath): Promise<Predictions> {
  const image = fs.readFileSync(filePath);
  const decodedImage = tfnode.node.decodeImage(image, 3);

  const model = await mobilenet.load();
  return await model.classify(decodedImage);
}

const LaunchRequestHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "LaunchRequest"
    );
  },
  async handle(handlerInput: HandlerInput) {
    const speakOutput =
      'Bem vindo ao Procure Uma Imagem. Você pode dizer: "Procure uma imagem do Will Smith", por exemplo.';

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt(speakOutput)
      .getResponse();
  },
};

const LinkTelegramIntentHandler: RequestHandler = {
  canHandle(handlerInput: HandlerInput): boolean {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === "LinkTelegramIntent"
    );
  },
  async handle(handlerInput: HandlerInput): Promise<Response> {
    const deviceId = Alexa.getDeviceId(handlerInput.requestEnvelope);
    const token = totp.generate(secret);
    const attributesManager = handlerInput.attributesManager;
    const attributes = await attributesManager.getPersistentAttributes();
    const telegramTokens = attributes.telegramTokens || {};

    attributesManager.setPersistentAttributes({
      ...attributes,
      telegramTokens: {
        ...telegramTokens,
        [deviceId]: token,
      },
    });
    await attributesManager.savePersistentAttributes();

    const speakOutput = `Envie este código para o @ProcureUmaImagemBot no Telegram: ${token}`;
    return handlerInput.responseBuilder.speak(speakOutput).getResponse();
  },
};

const ImageSearchIntentHandler: RequestHandler = {
  canHandle(handlerInput: HandlerInput): boolean {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === "ImageSearchIntent"
    );
  },
  async handle(handlerInput: HandlerInput): Promise<Response> {
    const deviceId = Alexa.getDeviceId(handlerInput.requestEnvelope);
    const imagem = Alexa.getSlotValue(handlerInput.requestEnvelope, "imagem");
    let speakOutput = `Certo, te enviei algumas imagens de ${imagem}`;
    const attributesManager = handlerInput.attributesManager;
    const attributes = await attributesManager.getPersistentAttributes();
    const telegramToken = attributes.telegramTokens?.[deviceId];
    let telegramId = attributes.linkedDevices?.[deviceId];
    const isDeviceLinked = !!telegramId;

    if (!isDeviceLinked) {
      if (telegramToken) {
        const telegramBotUpdates = await fetch(
          "https://api.telegram.org/INSIRA_SEU_BOT_ID_AQUI/getUpdates"
        );
        const { result: telegramResponse } = await telegramBotUpdates.json();

        for (const result of telegramResponse) {
          const { text, chat } = result.message;
          telegramId = chat.id;

          if (text.trim() === telegramToken) {
            attributesManager.setPersistentAttributes({
              ...attributes,
              linkedDevices: {
                [deviceId]: telegramId,
              },
            });
            await attributesManager.savePersistentAttributes();
            break;
          }
        }
      } else {
        speakOutput = `Hmm, não encontrei seu código do Telegram, tem certeza que digitou correto? O código é: ${telegramToken}`;
        return handlerInput.responseBuilder.speak(speakOutput).getResponse();
      }
    }

    // @ts-ignore
    const unsplash = createApi({
      accessKey: "INSIRA_UNSPLASH_API_KEY",
      fetch,
    });

    const { response: unsplashResponse } = await unsplash.search.getPhotos({
      query: imagem,
      page: 1,
      perPage: 3,
      lang: Language.Portuguese,
    });

    console.log("unsplashresponse", unsplashResponse);

    const downloadPromises = unsplashResponse.results.map((result) => {
      const url = result.urls.regular;
      const name = result.id;
      return downloadImage(url, name);
    });

    const downloaded = await Promise.all(downloadPromises);

    const predictionsPromises = downloaded.map((filePath: string) =>
      classifyImage(filePath)
    );

    const predictions = await Promise.all(predictionsPromises);

    console.log('predictions', predictions);

    const sendPhotoPromises = unsplashResponse.results.map((result, index) => {
      return fetch(
        "https://api.telegram.org/INSIRA_SEU_BOT_ID_AQUI/sendPhoto",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: telegramId,
            photo: result.urls.regular,
            caption: `Description: ${result.alt_description}\n\nPrediction: ${predictions[index][0].className}\n\nProbability: ${predictions[index][0].probability}`,
          }),
        }
      );
    });

    await Promise.all(sendPhotoPromises);

    return handlerInput.responseBuilder.speak(speakOutput).getResponse();
  },
};

/* *
 * FallbackIntent triggers when a customer says something that doesn’t map to any intents in your skill
 * It must also be defined in the language model (if the locale supports it)
 * This handler can be safely added but will be ingnored in locales that do not support it yet
 * */
const FallbackIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) ===
        "AMAZON.FallbackIntent"
    );
  },
  handle(handlerInput) {
    console.log(handlerInput);

    const speakOutput =
      'Desculpe, não entendi essa. Tente dizer: "Procure uma imagem de cachorro';

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt(speakOutput)
      .getResponse();
  },
};

/* *
 * SessionEndedRequest notifies that a session was ended. This handler will be triggered when a currently open
 * session is closed for one of the following reasons: 1) The user says "exit" or "quit". 2) The user does not
 * respond or says something that does not match an intent defined in your voice model. 3) An error occurs
 * */
const SessionEndedRequestHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) ===
      "SessionEndedRequest"
    );
  },
  handle(handlerInput) {
    console.log(
      `~~~~ Session ended: ${JSON.stringify(handlerInput.requestEnvelope)}`
    );
    // Any cleanup logic goes here.
    return handlerInput.responseBuilder.getResponse(); // notice we send an empty response
  },
};

/* *
 * The intent reflector is used for interaction model testing and debugging.
 * It will simply repeat the intent the user said. You can create custom handlers for your intents
 * by defining them above, then also adding them to the request handler chain below
 * */
const IntentReflectorHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest"
    );
  },
  handle(handlerInput) {
    const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
    const speakOutput = `You just triggered ${intentName} +=+=`;

    return (
      handlerInput.responseBuilder
        .speak(speakOutput)
        //.reprompt('add a reprompt if you want to keep the session open for the user to respond')
        .getResponse()
    );
  },
};

/**
 * Generic error handling to capture any syntax or routing errors. If you receive an error
 * stating the request handler chain is not found, you have not implemented a handler for
 * the intent being invoked or included it in the skill builder below
 * */
const ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(handlerInput, error) {
    const speakOutput =
      "Desculpe, tive dificuldades para fazer o que você pediu. Por favor, tente novamente.";
    console.log(`~~~~ Error handled: ${JSON.stringify(error)}`);

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt(speakOutput)
      .getResponse();
  },
};

const LogRequestInterceptor = {
  process(handlerInput) {
    // Log Request
    // console.log("==== REQUEST ======");
    // console.log(JSON.stringify(handlerInput.requestEnvelope, null, 2));
  },
};
/**
 * Response Interceptor to log the response made to Alexa
 */
const LogResponseInterceptor = {
  process(handlerInput, response) {
    // Log Response
    // console.log("==== RESPONSE ======");
    // console.log(JSON.stringify(response, null, 2));
  },
};

/**
 * This handler acts as the entry point for your skill, routing all request and response
 * payloads to the handlers above. Make sure any new handlers or interceptors you've
 * defined are included below. The order matters - they're processed top to bottom
 * */
exports.handler = Alexa.SkillBuilders.custom()
  .addRequestHandlers(
    LaunchRequestHandler,
    ImageSearchIntentHandler,
    LinkTelegramIntentHandler,
    FallbackIntentHandler,
    SessionEndedRequestHandler,
    IntentReflectorHandler
  )
  .addErrorHandlers(ErrorHandler)
  .withCustomUserAgent("sample/hello-world/v1.2")
  .withPersistenceAdapter(
    new Adapter.DynamoDbPersistenceAdapter({
      tableName: "procure-uma-imagem",
      createTable: true,
      dynamoDBClient: new AWS.DynamoDB({
        apiVersion: "latest",
        region: "us-east-1",
        credentials: {
          accessKeyId: "AMAZON_ACCESS_KEY_ID",
          secretAccessKey: "AWS_SECRET_ACCESS_KEY",
        },
      }),
    })
  )
  .addRequestInterceptors(LogRequestInterceptor)
  .addResponseInterceptors(LogResponseInterceptor)
  .lambda();
