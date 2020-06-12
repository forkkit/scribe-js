"use strict";
async function run(endpoint, config) {
    console.log("Hitting " + endpoint.uri);
    const http = require('http');
    let responseContent;
    const promise = new Promise((resolve, reject) => {
        const req = http.request(config.baseUrl + endpoint.uri, {
            method: Object.keys(endpoint.route.methods)[0],
        }, (resp) => {
            let data = '';
            resp.on('data', (chunk) => {
                data += chunk;
            });
            resp.on('end', () => {
                responseContent = data;
                resolve({
                    status: resp.statusCode,
                    content: responseContent
                });
            });
        }).on("error", (err) => {
            console.log("Error: " + err.message);
            reject(err);
        });
        req.end();
    });
    return promise.then(response => {
        return [response];
    }).catch((err) => {
        console.log(err);
        return [];
    });
}
module.exports = {
    routers: [],
    run
};
//# sourceMappingURL=response_call.js.map