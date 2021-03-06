"use strict";
const d = require("../../utils/docblocks");
async function run(endpoint, config) {
    const docblock = await d.getDocBlockForEndpoint(endpoint) || {};
    return docblock.queryParam || {};
}
module.exports = {
    routers: [],
    run
};
//# sourceMappingURL=query_param_tag.js.map