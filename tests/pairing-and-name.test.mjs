// Run: npm test
// 配对二维码载荷格式 + 手机上报设备名。
//
// 两条都是「两端约定」，坏了不会报错、只会表现为「扫不上」或「电脑上显示一串泛名」：
//  - 桌面端把载荷从对象压成数组（字段名在二维码里是纯开销），老版本生成的二维码仍必须能扫；
//  - iOS 16 起没配 entitlement 时 deviceName 恒为 "iPhone"，此时要用型号兜底。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parsePairingUri } from '../src/connection/pairing-uri.ts';
import { resolveDeviceName } from '../src/connection/device-name.ts';

const base = {
  version: 1,
  token: 'tok_abcdefghijklmnop',
  pcId: 'pc-1',
  pcName: 'Amon 的 MacBook Pro',
  addresses: ['192.168.1.8'],
  port: 47778,
  publicKey: 'AQIDBAUGBwgJCgsMDQ4PEA==',
  expiresAt: Date.now() + 60_000,
};

function encodeArray(value) {
  const arr = [value.version, value.token, value.pcId, value.pcName, value.addresses, value.port, value.publicKey, value.expiresAt];
  return Buffer.from(JSON.stringify(arr), 'utf8').toString('base64url');
}

function encodeObject(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

const uri = (payload) => `easymint://pair?payload=${payload}`;

test('数组载荷（旧桌面端长码）仍能解出完整 offer', () => {
  const target = parsePairingUri(uri(encodeArray(base)));
  assert.equal(target.kind, 'offer');
  const offer = target.offer;
  assert.equal(offer.token, base.token);
  assert.equal(offer.pcId, base.pcId);
  assert.equal(offer.pcName, base.pcName);
  assert.deepEqual(offer.addresses, base.addresses);
  assert.equal(offer.port, 47778);
  assert.equal(offer.publicKey, base.publicKey);
});

test('对象载荷（更早的桌面端）仍能扫，升级手机端不废老二维码', () => {
  const target = parsePairingUri(uri(encodeObject(base)));
  assert.equal(target.kind, 'offer');
  assert.equal(target.offer.token, base.token);
  assert.deepEqual(target.offer.addresses, base.addresses);
});

test('短码二维码（当前桌面端）约 50 字符，比长码稀疏一个数量级', () => {
  const short = parsePairingUri('easymint://pair?h=192.168.1.8&p=47778&c=AB3XY9');
  assert.equal(short.kind, 'compact');
  assert.equal(short.host, '192.168.1.8');
  assert.equal(short.port, 47778);
  assert.equal(short.code, 'AB3XY9');
  const lean = `easymint://pair?h=192.168.1.8&p=47778&c=AB3XY9`.length;
  const long = uri(encodeArray(base)).length;
  assert.ok(lean < 60, `短码应 <60 字符，实际 ${lean}`);
  assert.ok(long > lean * 3, `短码应至少比长码短三倍：${lean} vs ${long}`);
});

test('数组比对象短，压缩确实省在二维码上', () => {
  const lean = encodeArray(base).length;
  const fat = encodeObject(base).length;
  assert.ok(lean < fat, `数组应更短：${lean} vs ${fat}`);
  // 实测约三成；留一点余量，格式回退时这条会先红
  assert.ok(lean <= fat * 0.78, `压缩率不足：${lean}/${fat}`);
});

test('载荷被截断或字段缺失时报「内容不完整」，不抛底层异常', () => {
  assert.throws(() => parsePairingUri(uri('@@@not-base64')), /内容不完整|不是 EasyMint/);
  const partial = Buffer.from(JSON.stringify([1, 'tok']), 'utf8').toString('base64url');
  assert.throws(() => parsePairingUri(uri(partial)), /内容不完整/);
  const expired = encodeArray({ ...base, expiresAt: Date.now() - 1_000 });
  assert.throws(() => parsePairingUri(uri(expired)), /已过期/);
  assert.throws(() => parsePairingUri(uri(encodeArray({ ...base, addresses: [] }))), /没有可用的局域网地址/);
});

test('设备名：有自定义名用自定义名', () => {
  assert.equal(resolveDeviceName({ deviceName: 'Amon 的 iPhone', modelName: 'iPhone 15 Pro', osName: 'iOS' }), 'Amon 的 iPhone');
});

test('设备名：iOS 16+ 的泛名 "iPhone" 让位给型号', () => {
  assert.equal(resolveDeviceName({ deviceName: 'iPhone', modelName: 'iPhone 15 Pro', osName: 'iOS' }), 'iPhone 15 Pro');
  assert.equal(resolveDeviceName({ deviceName: 'iPhone', modelName: null, osName: 'iOS' }), 'iPhone');
});

test('设备名：Android 型号与兜底', () => {
  assert.equal(resolveDeviceName({ deviceName: null, modelName: 'Pixel 8', osName: 'Android' }), 'Pixel 8');
  assert.equal(resolveDeviceName({}), '手机');
  assert.equal(resolveDeviceName({ osName: 'Android' }), 'Android');
  assert.equal(resolveDeviceName({ osName: 'iPadOS' }), 'iPad');
});

test('短码查表失败要关连接：漏了会占满电脑的连接上限', () => {
  const source = readFileSync(new URL('../src/connection/remote-client.ts', import.meta.url), 'utf8');
  // 查表失败的分支必须自己收尾——长码路径由 Promise 内的 finish 统一 close，短码没有那层
  assert.match(source, /offer = await lookupOffer\(socket, target\.code\);[\s\S]{0,320}?socket\.close\(\);/,
    'lookup 失败路径必须 socket.close()');
  assert.match(source, /if \(message\?\.type === 'mobile-pair-lookup-failed'\)/,
    '必须识别 lookup-failed，别把失败当超时干等 5 秒');
});

test('配对上报的 deviceId 必须稳定：随机 id 会让同一台手机在电脑上堆记录', () => {
  const source = readFileSync(new URL('../src/connection/remote-client.ts', import.meta.url), 'utf8');
  // 电脑端 acceptPair 只按 deviceId 覆盖，随机 id 等于每次扫码新增一条同名设备
  assert.match(source, /const deviceId = await appDeviceId\(\);/, 'pairWithPc 必须用稳定的本机 deviceId');
  assert.doesNotMatch(source, /const deviceId = randomId\(\);/, '不能再按每次配对随机生成');

  const install = readFileSync(new URL('../src/security/installation-id.ts', import.meta.url), 'utf8');
  assert.match(install, /easymint\.installation-id\.v1/, '安装标识要落 SecureStore，重装前保持不变');
  assert.match(install, /`app-\$\{/, 'App 设备带 app- 前缀，桌面端按前缀分流准入');
});
