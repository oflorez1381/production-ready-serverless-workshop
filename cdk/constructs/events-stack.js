const { Stack, Duration, CfnOutput } = require('aws-cdk-lib')
const { EventBus, Rule, RuleTargetInput, EventField } = require('aws-cdk-lib/aws-events')
const { LambdaFunction, SqsQueue } = require('aws-cdk-lib/aws-events-targets')
const { Topic, Subscription } = require('aws-cdk-lib/aws-sns')
const { Runtime } = require('aws-cdk-lib/aws-lambda')
const { NodejsFunction } = require('aws-cdk-lib/aws-lambda-nodejs')
const { Queue } = require('aws-cdk-lib/aws-sqs')
const { PolicyStatement, ServicePrincipal } = require('aws-cdk-lib/aws-iam')

class EventsStack extends Stack {
    constructor(scope, id, props) {
        super(scope, id, props)

        const orderEventBus = new EventBus(this, 'OrderEventBus', {
            eventBusName: `${props.serviceName}-${props.stageName}-order-events`,
        })

        this.orderEventBus = orderEventBus

        const restaurantNotificationTopic = new Topic(this, 'RestaurantNotificationTopic')

        const notifyRestaurantFunction = new NodejsFunction(this, 'NotifyRestaurantFunction', {
            runtime: Runtime.NODEJS_18_X,
            handler: 'handler',
            entry: 'functions/notify-restaurant.js',
            environment: {
                bus_name: orderEventBus.eventBusName,
                restaurant_notification_topic: restaurantNotificationTopic.topicArn,
                idempotency_table: props.idempotencyTable.tableName
            }
        })
        orderEventBus.grantPutEventsTo(notifyRestaurantFunction)
        restaurantNotificationTopic.grantPublish(notifyRestaurantFunction)
        props.idempotencyTable.grantReadWriteData(notifyRestaurantFunction)

        const rule = new Rule(this, 'Rule', {
            eventBus: orderEventBus,
            eventPattern: {
                source: ['big-mouth'],
                detailType: ['order_placed'],
            }
        })
        rule.addTarget(new LambdaFunction(notifyRestaurantFunction))

        const isE2eTest = props.stageName.startsWith('dev')
        if (isE2eTest) {
            this.declareTestResources(restaurantNotificationTopic, orderEventBus)
        }
    }

    declareTestResources(restaurantNotificationTopic, orderEventBus) {
        const testQueue = new Queue(this, 'E2eTestQueue', {
            retentionPeriod: Duration.seconds(60),
            visibilityTimeout: Duration.seconds(1)
        })

        testQueue.addToResourcePolicy(new PolicyStatement({
            actions: ['sqs:SendMessage'],
            resources: [testQueue.queueArn],
            principals: [new ServicePrincipal('sns.amazonaws.com')],
            conditions: {
                ArnEquals: {
                    'aws:SourceArn': restaurantNotificationTopic.topicArn,
                }
            }
        }))

        testQueue.addToResourcePolicy(new PolicyStatement({
            actions: ['sqs:SendMessage'],
            resources: [testQueue.queueArn],
            principals: [new ServicePrincipal('events.amazonaws.com')],
            conditions: {
                ArnEquals: {
                    'aws:SourceArn': orderEventBus.eventBusArn,
                }
            }
        }))

        new Subscription(this, 'E2eTestSnsSubscription', {
            topic: restaurantNotificationTopic,
            protocol: 'sqs',
            endpoint: testQueue.queueArn,
            rawMessageDelivery: false
        })

        const sqsRule = new Rule(this, 'SqsRule', {
            eventBus: orderEventBus,
            eventPattern: {
                source: ['big-mouth']
            }
        })
        sqsRule.addTarget(new SqsQueue(testQueue, {
            message: RuleTargetInput.fromObject({
                event: {
                    source: EventField.source,
                    'detail-type': EventField.detailType,
                    detail: EventField.fromPath('$.detail')
                },
                eventBusName: orderEventBus.eventBusName
            })
        }))

        new CfnOutput(this, 'E2eTestQueueUrl', {
            value: testQueue.queueUrl
        })
    }
}

module.exports = { EventsStack }