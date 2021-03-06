"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
module.exports = generate;
const spawn = require("cross-spawn");
const matcher = require("matcher");
const path = require("path");
const fs = require("fs");
const log = require('debug')('lib:scribe');
const utils = require("./utils");
function generate(configFile, appFile, serverFile) {
    if (!serverFile) {
        console.log("WARNING: You didn't specify a server file. This means that either your app is started by your app file, or you forgot.");
        console.log("If you forgot, you'll need to specify a server file for response calls to work.");
    }
    const config = require(configFile);
    if (!config.router) {
        let router;
        const pkgJson = require(path.resolve('package.json'));
        if ('express' in pkgJson.dependencies) {
            router = 'express';
        }
        config.router = router;
        log(`Detected router: ${router}`);
    }
    const app = require(appFile);
    if (!app._router) {
        console.error("Couldn't find an export from your app file. Did you remember to export your `app` object?");
        process.exit(1);
    }
    if (!app._decoratedByScribe) {
        console.error("Something's not right. Did you remember to add `require('@knuckleswtf/scribe')(app)` before registering your Express routes?");
        process.exit(1);
    }
    config.routes.forEach(async (routeGroup) => {
        const getEndpoints = require(`./1_get_routes/${config.router}`);
        const endpoints = getEndpoints(app);
        let endpointsToDocument = endpoints.filter(e => {
            if (routeGroup.exclude.length) {
                const shouldExclude = matcher.isMatch(e.uri, routeGroup.exclude);
                if (shouldExclude)
                    return false;
            }
            return matcher.isMatch(e.uri, routeGroup.include);
        });
        const strategies = config.strategies || {
            metadata: [
                require('./2_extract_info/1_metadata/docblocks'),
            ],
            headers: [
                require('./2_extract_info/2_headers/header_tag'),
            ],
            urlParameters: [
                require('./2_extract_info/3_url_parameters/express_route_api'),
                require('./2_extract_info/3_url_parameters/url_param_tag'),
            ],
            queryParameters: [
                require('./2_extract_info/4_query_parameters/query_param_tag'),
            ],
            bodyParameters: [
                require('./2_extract_info/5_body_parameters/read_source_code'),
                require('./2_extract_info/5_body_parameters/body_param_tag'),
            ],
            responses: [
                require('./2_extract_info/6_responses/response_tag'),
                require('./2_extract_info/6_responses/response_call'),
            ],
            responseFields: [
                require('./2_extract_info/7_response_fields/response_field_tag'),
            ],
        };
        for (let endpoint of endpointsToDocument) {
            for (let metadataStrategy of strategies.metadata) {
                if (shouldUseWithRouter(metadataStrategy, config.router)) {
                    endpoint.metadata = Object.assign({}, endpoint.metadata, await metadataStrategy.run(endpoint, config, routeGroup));
                }
            }
            for (let headersStrategy of strategies.headers) {
                if (shouldUseWithRouter(headersStrategy, config.router)) {
                    endpoint.headers = Object.assign({}, endpoint.headers, await headersStrategy.run(endpoint, config, routeGroup));
                }
            }
            for (let urlParametersStrategy of strategies.urlParameters) {
                if (shouldUseWithRouter(urlParametersStrategy, config.router)) {
                    endpoint.urlParameters
                        = Object.assign({}, endpoint.urlParameters, await urlParametersStrategy.run(endpoint, config, routeGroup));
                }
                // Replace parameters in URL
                endpoint.boundUri = Object.values(endpoint.urlParameters)
                    .reduce((uri, p) => {
                    // Optional parameters with no value won't get substituted
                    return uri.replace(p.match, p.value == null ? '' : p.value);
                }, endpoint.uri);
                // Replace parameters in URL
                endpoint.uri = Object.values(endpoint.urlParameters)
                    .reduce((uri, p) => {
                    return p.placeholder ? uri.replace(p.match, p.placeholder) : uri;
                }, endpoint.uri);
            }
            for (let queryParametersStrategy of strategies.queryParameters) {
                if (shouldUseWithRouter(queryParametersStrategy, config.router)) {
                    endpoint.queryParameters
                        = Object.assign({}, endpoint.queryParameters, await queryParametersStrategy.run(endpoint, config, routeGroup));
                }
            }
            endpoint.cleanQueryParameters = utils.removeEmptyOptionalParametersAndTransformToKeyValue(endpoint.queryParameters);
            for (let bodyParametersStrategy of strategies.bodyParameters) {
                if (shouldUseWithRouter(bodyParametersStrategy, config.router)) {
                    endpoint.bodyParameters
                        = Object.assign({}, endpoint.bodyParameters, await bodyParametersStrategy.run(endpoint, config, routeGroup));
                }
            }
            endpoint.cleanBodyParameters = utils.removeEmptyOptionalParametersAndTransformToKeyValue(endpoint.bodyParameters);
            let appProcess;
            if (serverFile) {
                // Using a single global app process here to avoid premature kills
                try {
                    appProcess = spawn('node', [serverFile], { stdio: 'inherit' });
                }
                catch (e) {
                    // do nothing; app is probably running already
                }
            }
            endpoint.responses = [];
            for (let responsesStrategy of strategies.responses) {
                if (shouldUseWithRouter(responsesStrategy, config.router)) {
                    const responses = await responsesStrategy.run(endpoint, config, routeGroup);
                    endpoint.responses = endpoint.responses.concat(responses);
                }
            }
            appProcess && appProcess.kill();
            for (let responseFieldsStrategy of strategies.responseFields) {
                if (shouldUseWithRouter(responseFieldsStrategy, config.router)) {
                    endpoint.responseFields
                        = Object.assign({}, endpoint.responseFields, await responseFieldsStrategy.run(endpoint, config, routeGroup));
                }
            }
        }
        const html = require("./3_write_output/html");
        const sourceOutputPath = path.resolve('docs');
        !fs.existsSync(sourceOutputPath) && fs.mkdirSync(sourceOutputPath, { recursive: true });
        html.writeIndexMarkdownFile(config, sourceOutputPath);
        html.writeAuthMarkdownFile(config, sourceOutputPath);
        html.writeGroupMarkdownFiles(endpointsToDocument, config, sourceOutputPath);
        const pastel = require('@knuckleswtf/pastel');
        await pastel.generate(sourceOutputPath + '/index.md', path.resolve(config.outputPath));
    });
}
// Possible (Express, exported app):
// 1. get endpoint
// 2. get url of endpoint
// 3. response calls
// 4. URL Parameters
// 5. Query/body - Scan code for req.body.X, { X } = req.body
// NB - handle sub-apps
// Potential (framework-specific)
// 1. Parameter names and types (from validation)
function shouldUseWithRouter(strategy, currentRouter) {
    if (strategy.routers == null || strategy.routers.length == 0) {
        return true;
    }
    return strategy.routers.includes(currentRouter);
}
//# sourceMappingURL=index.js.map