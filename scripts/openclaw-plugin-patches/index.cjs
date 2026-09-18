'use strict';

const { patchDingtalk } = require('./dingtalk.cjs');
const { patchLark } = require('./lark.cjs');
const { patchWeixin } = require('./weixin.cjs');
const { patchWecom } = require('./wecom.cjs');

function applyOpenClawPluginPatches(context) {
  patchWeixin(context);
  patchLark(context);
  patchDingtalk(context);
  patchWecom(context);
}

module.exports = {
  applyOpenClawPluginPatches,
};
