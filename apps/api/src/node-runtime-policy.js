export const MINIMUM_NODE_VERSION='24.22.3';

// Only the reviewed Node.js 24 LTS line is supported. Patch releases
// within this major remain allowed so security updates are not blocked.
export function isSupportedNodeVersion(version){
  const match=/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(version??'');
  if(!match)return false;
  const [major,minor,patch]=match.slice(1).map(Number);
  return major===24&&Number.isSafeInteger(minor)&&Number.isSafeInteger(patch)
    &&(minor>22||(minor===22&&patch>=3));
}

export function assertSupportedNodeVersion(version=process.version){
  if(!isSupportedNodeVersion(version))
    throw new Error('Node.js 24.22.3 atau lebih baru dalam lini 24 LTS diperlukan.');
}
