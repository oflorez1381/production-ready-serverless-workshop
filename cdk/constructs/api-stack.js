const { Stack, Construct, StackProps } = require('aws-cdk-lib')
const { Runtime, Code, Function } = require('aws-cdk-lib/aws-lambda')
const { RestApi, LambdaIntegration } = require('aws-cdk-lib/aws-apigateway')

class ApiStack extends Stack {
    /**
     * @param {Construct} scope
     * @param {string} id
     * @param {StackProps} props
     */
    constructor(scope, id, props) {
        super(scope, id, props)

        const lambdaFunction = new Function(this, 'HandlerFunction', {
            runtime: Runtime.NODEJS_18_X,
            handler: 'handler.hello',
            code: Code.fromAsset('functions'),
        })

        const api = new RestApi(this, 'MyApi')

        const lambdaIntegration = new LambdaIntegration(lambdaFunction)
        api.root.addMethod('GET', lambdaIntegration)
    }
}

module.exports = { ApiStack }