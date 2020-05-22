import {express} from "../../../typedefs/express";

const spawn = require('cross-spawn');
import utils = require('../../utils');


async function getRouteResponse(route: {route: express.Route, fullPath: string}, mainFilePath: string, config) {
    console.log("Hitting " + route.fullPath);

    let appProcess;

    const url = new URL(config.baseUrl);
    if (!(await utils.isPortTaken(url.port))) {
        appProcess = spawn('node', [mainFilePath], { stdio: 'inherit' });
    }

    const http = require('http');
    let fullResponse;
    const promise = new Promise((resolve, reject) => {
        const req = http.request(config.baseUrl + route.fullPath,
            {
                method: Object.keys(route.route.methods)[0],
            },
            (resp) => {
            let data = '';

            resp.on('data', (chunk) => {
                data += chunk;
            });

            resp.on('end', () => {
                fullResponse = data;
                resolve(fullResponse);
            });

        }).on("error", (err) => {
            console.log("Error: " + err.message);
            reject(err);
        });

        req.end();
    });

    return promise.then(response => {
        appProcess && appProcess.kill();
        return {fullPath: route.fullPath, response};
    }).catch((err) => {
        appProcess && appProcess.kill();
        console.log(err);
    });
}

export = (route, mainFilePath, config) => {
    return getRouteResponse(route, mainFilePath, config);
};