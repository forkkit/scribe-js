"use strict";
const d = require("../../utils/docblocks");
async function run(endpoint, config) {
    const docblock = await d.getDocBlockForEndpoint(endpoint) || {};
    return docblock.responseField || {};
}
module.exports = {
    routers: [],
    run
};
//# sourceMappingURL=docblocks.js.map