#!/usr/bin/env node

const cdk = require('aws-cdk-lib')
const { ApiStack } = require('./constructs/api-stack')

const app = new cdk.App()
new ApiStack(app, 'ApiStack')