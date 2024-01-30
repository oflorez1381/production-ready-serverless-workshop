const { Logger, injectLambdaContext } = require('@aws-lambda-powertools/logger')
const logger = new Logger({ serviceName: process.env.serviceName })
const { EventBridgeClient, PutEventsCommand } = require('@aws-sdk/client-eventbridge')
const eventBridge = new EventBridgeClient()
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns')
const sns = new SNSClient()
const { makeIdempotent } = require('@aws-lambda-powertools/idempotency')
const { DynamoDBPersistenceLayer } = require('@aws-lambda-powertools/idempotency/dynamodb')
const middy = require('@middy/core')
const { Tracer, captureLambdaHandler } = require('@aws-lambda-powertools/tracer')
const tracer = new Tracer({ serviceName: process.env.serviceName })
tracer.captureAWSv3Client(eventBridge)
tracer.captureAWSv3Client(sns)

const busName = process.env.bus_name
const topicArn = process.env.restaurant_notification_topic

const persistenceStore = new DynamoDBPersistenceLayer({
    tableName: process.env.idempotency_table
})

const handler = middy(async (event) => {
    logger.refreshSampleRateCalculation()
    const order = event.detail
    const publishCmd = new PublishCommand({
        Message: JSON.stringify(order),
        TopicArn: topicArn
    })
    await sns.send(publishCmd)

    const { restaurantName, orderId } = order
    logger.debug(`notified restaurant [${restaurantName}] of order [${orderId}]`)

    const putEventsCmd = new PutEventsCommand({
        Entries: [{
            Source: 'big-mouth',
            DetailType: 'restaurant_notified',
            Detail: JSON.stringify(order),
            EventBusName: busName
        }]
    })
    await eventBridge.send(putEventsCmd)

    logger.debug(`published 'restaurant_notified' event to EventBridge`)

    return orderId
}).use(injectLambdaContext(logger))
    .use(captureLambdaHandler(tracer))

module.exports.handler = makeIdempotent(handler, { persistenceStore })
