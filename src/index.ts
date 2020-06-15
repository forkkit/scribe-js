import {scribe} from "../typedefs/core";

const spawn = require('cross-spawn');
const matcher = require('matcher');

import utils = require('./utils');
import html = require("./3_write_output/html");

const fileName = process.argv[2] || 'D:\\Projects\\Temp\\whot-server\\index.js';
const config: scribe.Config = require('../config.js');

const app = require(fileName);

config.routes.forEach(async (routeGroup) => {
    const getEndpoints = require(`./1_get_routes/${config.router}`);

    const endpoints: scribe.Endpoint[] = getEndpoints(app);

    let endpointsToDocument = endpoints.filter(e => {
        if (routeGroup.exclude.length) {
            const shouldExclude = matcher.isMatch(e.uri, routeGroup.exclude);
            if (shouldExclude) return false;
        }

        return matcher.isMatch(e.uri, routeGroup.include);
    });
    const strategies = config.strategies || {
        metadata: [
            require('./2_extract_info/1_metadata/docblocks'),
        ],
        headers: [
//            require('./2_extract_info/2_headers/'),
        ],
        urlParameters: [
            require('./2_extract_info/3_url_parameters/express_route_api'),
        ],
        queryParameters: [
//            require('./2_extract_info/4_query_parameters/'),
        ],
        bodyParameters: [
            require('./2_extract_info/5_body_parameters/read_source_code'),
        ],
        responses: [
            require('./2_extract_info/6_responses/response_call'),
        ],
        responseFields: [
            //           require('./2_extract_info/7_response_fields/'),
        ],
    };

    for (let endpoint of endpointsToDocument) {
        for (let metadataStrategy of strategies.metadata) {
            if (shouldUseWithRouter(metadataStrategy, config.router)) {
                endpoint.metadata = Object.assign({}, endpoint.metadata, metadataStrategy.run(endpoint, config));
            }
        }

        for (let headersStrategy of strategies.headers) {
            if (shouldUseWithRouter(headersStrategy, config.router)) {
                endpoint.headers = Object.assign({}, endpoint.headers, headersStrategy.run(endpoint, config));
            }
        }

        for (let urlParametersStrategy of strategies.urlParameters) {
            if (shouldUseWithRouter(urlParametersStrategy, config.router)) {
                endpoint.urlParameters = Object.assign({}, endpoint.urlParameters, urlParametersStrategy.run(endpoint, config));
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
                endpoint.queryParameters = Object.assign({}, endpoint.queryParameters, queryParametersStrategy.run(endpoint, config));
            }
        }
        endpoint.cleanQueryParameters = utils.removeEmptyOptionalParametersAndTransformToKeyValue(endpoint.queryParameters);

        for (let bodyParametersStrategy of strategies.bodyParameters) {
            if (shouldUseWithRouter(bodyParametersStrategy, config.router)) {
                endpoint.bodyParameters = Object.assign({}, endpoint.bodyParameters, bodyParametersStrategy.run(endpoint, config));
            }
        }
        endpoint.cleanBodyParameters = utils.removeEmptyOptionalParametersAndTransformToKeyValue(endpoint.bodyParameters);

        // Using a single global app process here to avoid premature kills
        let appProcess;
        const url = new URL(config.baseUrl);
        if (!(await utils.isPortTaken(url.port || 80))) {
            appProcess = spawn('node', [fileName], {stdio: 'inherit'});
        }
        endpoint.responses = [];
        for (let responsesStrategy of strategies.responses) {
            if (shouldUseWithRouter(responsesStrategy, config.router)) {

                const responses = await responsesStrategy.run(endpoint, config, fileName)
                endpoint.responses = endpoint.responses.concat(responses)
            }
        }
        appProcess && appProcess.kill();

        for (let responseFieldsStrategy of strategies.responseFields) {
            if (shouldUseWithRouter(responseFieldsStrategy, config.router)) {
                endpoint.responseFields = Object.assign({}, endpoint.responseFields, responseFieldsStrategy.run(endpoint, config));
            }
        }
    }

    html.writeIndexMarkdownFile(config);
    html.writeAuthMarkdownFile(config);
    html.writeGroupMarkdownFiles(endpointsToDocument, config);

    // For now, I'm using my local Pastel PHP binary, until I can get Pastel ported to JS.
    const pathToPastel = 'D:\\Projects\\pastel\\pastel';
    spawn.sync('php', [pathToPastel, 'generate', require('path').resolve(__dirname, '../docs/index.md')], {stdio: 'inherit'})
});

// Possible (Express, exported app):
// 1. get endpoint
// 2. get url of endpoint
// 3. response calls
// 4. URL Parameters
// 5. Query/body - Scan code for req.body.X, { X } = req.body
// NB - handle sub-apps

// Potential (framework-specific)
// 1. Parameter names and types (from validation)

function shouldUseWithRouter(strategy: scribe.Strategy, currentRouter: scribe.SupportedRouters): boolean {
    if (strategy.routers == null || strategy.routers.length == 0) {
        return true;
    }

    return strategy.routers.includes(currentRouter);
}