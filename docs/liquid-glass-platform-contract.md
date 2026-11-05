# 液态玻璃跨平台实现与模板复现要求

更新于 2026 年 11 月 6 日。Em 正式模板已从 SVG 位移图切换到 WebGL2，与 Android 共用 AGSL 派生的材质核心。旧 SVG 实验页仅保留作历史对照。

最终参数：App 使用 `em-liquid-app.json`（模糊 2.5 dp），Web 使用 `liquid-template-preset.json`（模糊 0.2 CSS px）；其余光学参数一致。主题、演示位置和滚动值不应强制覆盖业务布局。

下面是随 Em 模板导出的完整实现契约，Mint 可直接读取同一份 `LIQUID-GLASS.md`。

# Liquid Glass shared material and platform implementation

The selected Liquid Glass template uses the shared droplet material and WebGL 2 as its primary Web backend. Keep the accepted parameter files with the actual renderer. SVG displacement maps are archived comparison code, not the selected production material.

## Files Mint must read

- `liquid-template-preset.json` is the user's final Web/template preset. Its blur radius is 0.2 logical units.
- `liquid-app-preset.json` is the user's final native App preset. Its blur radius is 2.5 dp.
- `liquid-material.agsl` is the shared parametric material kernel. It contains SDF geometry, height-field normals, two-interface refraction, wider lateral shoulders, extra droplet-rim refraction, RGB dispersion, neighborhood-dependent shading and the accepted fine contours.
- `liquid-material-source.ts` is the generated GLSL core used by the Web renderer.
- `liquid-webgl.ts` is the portable Web reference source. `runtime.js` already bundles this renderer and html2canvas, and runs without a CDN or package loader.
- `liquid-android-reference.kt` is the Android/Expo reference used in EasyMintMobile. For a native target, read it together with the shared kernel and App preset.
- `showcase.html` and `showcase-mobile.html` are runnable references from the same production template source as the picker. Test the actual target rather than assuming cross-platform parity.

The exported JSON also includes theme, demo background, probe position and demo scroll position. Use `parameters` as the material preset. App theme follows its user preference and input-card position follows its real keyboard/safe-area layout. The circular probe is a preview aid.

## Accepted material parameters

The two presets have the same optical settings, with different blur radius. IOR is 1.5; bevel ratio 0.115; base refraction width 1.36; lateral range 1.30; height ratio 0.52; normal kernel ratio 0.04; background travel 0.86; lateral travel 1.30; face scale 1.0; extra rim displacement 0.23; lateral extra displacement 1.22; extra rim range 0.60; base dispersion 0.006; extra rim dispersion 0.002; lateral dark contour 0.26; horizontal light contour 0.24; contour inset 0.40 dp; contour width 0.20 dp; scene adaptation 1.0; environment mix 1.15. Light tint is 0, dark tint is black at 5%.

Read the JSON rather than retyping these numbers. Geometry is measured in logical CSS px/dp and converted to the material's reference pixel units. On Android use actual display density. The Web reference uses the preset's `referenceScale` for fine-edge and antialiasing equivalence, separately from the canvas raster resolution.

## Web implementation

1. Mark the scene root and background content. The shipped scene uses `[data-ios-root]` and `[data-ios-scroll]`. New compositions may use `[data-liquid-backdrop]` and `[data-liquid-glass]` with the same renderer.
2. Keep content in the DOM. The renderer captures the controlled scene background with bundled html2canvas and caches a full scroll-content texture. It does not capture browser chrome or external applications.
3. During scroll, update background sample coordinates using the live content scroll offset and element bounds. Reuse the cached texture. Re-capture on content, theme or size changes, with an asynchronous revision guard so stale captures cannot replace newer content.
4. Draw the shared GLSL material in one WebGL 2 context and copy the small glass surfaces into transparent canvases inside the real controls. DOM text, input and hit targets remain in front.
5. Preserve the fine dark left/right contour and fine light top/bottom contour. Their direction weights fade continuously through rounded corners. Extra rim refraction smoothly joins the main field. RGB path differences remain confined to the edge.
6. Honor `prefers-reduced-transparency`, cleanup, page visibility and context loss. Read `data-liquid-backend` for the active path. `webgl2` means the optical renderer is active. `blur-fallback` and `reduced-transparency` are declared reduced paths.

`runtime.js` is the ready-to-use self-contained Web integration. For a framework-native import of the source reference, install html2canvas 1.4.1, retain `liquid-material-source.ts` and `liquid-template-preset.json` next to `liquid-webgl.ts`, and call `mountLiquidWebGL(root)` after layout. Call its returned cleanup on unmount.

Background capture supports the controlled template's ordinary text, images, gradients and layout. html2canvas has CSS support limits, including filters, blend modes and some transforms. Cross-origin images need CORS. For video, canvas animation, unsupported CSS or a continuously animated background, supply a controlled texture/capture backend instead of assuming a static DOM capture reproduces all pixels. These limitations concern background acquisition, while the shared shader defines the material.

The browser blur is a separable Gaussian approximation. GPU precision, raster resolution, blur kernels and background capture may differ from native output. Keep the same reference background, dimensions and state when comparing.

## Android implementation

Use RuntimeShader and RenderEffect on Android 13/API 33 and later. The supplied Kotlin reference is an Expo native View. Register `em.lens.LensModule` in a local Expo module; its View exposes `targetTag` and `radius`. In Compose, host the same rendering View through AndroidView or implement the equivalent capture and material stages in the target toolkit.

Place the files into the Android assets directory as `em-liquid-material.agsl` and `em-liquid-app.json`. The View reads the shipped App preset, builds the curved material with actual display density, records the specified native background into a RenderNode, and binds every optical parameter as a shader uniform. Foreground input text and controls remain sibling layers above it.

The reference records a padded source region, aligns screen coordinates, clips only the final material output to its View, and uses the SDF for the optical contour. Neighborhood capture coordinates must be clamped to valid surface pixels. Unpremultiply valid neighborhood samples before color mixing and handle near-zero alpha. This guards against the hard bottom seam observed during development; removing normal bevel shadows does not fix that acquisition bug.

The captured View must exclude the glass and its foreground to prevent recursive capture. In a chat scene, keep the message list behind the floating composer, measure the floating height for list insets, and let keyboard/safe-area layout position the real input card. The status bar and title bar can share a frosted overlay with radius zero.

Below API 33, declare the actual fallback. A blur/tint fallback is not a completed port of the custom refraction. Test capability, gestures, streaming updates, keyboard transitions, density changes, lifecycle and sustained performance. The reference requests updates at 33 ms; this is not a measured frame-rate guarantee.

## iOS native system material

The selected iOS route uses Apple's system Liquid Glass, exposed by `expo-glass-effect` ~57.0.5. EasyMintMobile's `SystemGlass.ios.tsx` supplies a background-only GlassView to the shared Glass component for the chat composer and the two circular floating actions. Metro's default `SystemGlass.tsx` keeps Android on its existing custom AGSL backend without importing the iOS implementation.

Require both `isGlassEffectAPIAvailable()` and `isLiquidGlassAvailable()`; an OS version check alone misses compiler/Info.plist/runtime availability. Wait for the Reduce Transparency preference, subscribe to changes, and use an opaque themed surface when enabled. Unsupported iOS uses an actual BlurView with a readable frosted tint, not GlassView's plain-View fallback.

Use `glassEffectStyle="clear"` and explicitly pass the App's resolved `colorScheme` so the in-app appearance selector controls the material. Keep the native surface non-accessible and pointerEvents none; RN foreground input and Pressable targets remain siblings above it. Existing scale-based press feedback is retained. Do not animate a GlassView or its ancestors to opacity zero; use the effect's own transition options if a fade is required.

A minimal background-only integration (the application's resolved theme is passed explicitly):

```tsx
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { BlurView } from 'expo-blur';
import { StyleSheet, View } from 'react-native';

// reduceTransparency comes from AccessibilityInfo's initial query + live change event.
const supported = isGlassEffectAPIAvailable() && isLiquidGlassAvailable();
const background = reduceTransparency === true
  ? <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.card }]} />
  : supported && reduceTransparency === false
    ? <GlassView pointerEvents="none" accessible={false} glassEffectStyle="clear"
        colorScheme={effectiveMode} style={[StyleSheet.absoluteFill, { borderRadius: radius }]} />
    : <BlurView pointerEvents="none" intensity={44} tint={effectiveMode}
        style={StyleSheet.absoluteFill} />; // Add a restrained frosted fill for this fallback only.
// Render `background` behind the existing RN input and press targets; do not nest them inside it.
```

The native surface owns its refraction, lighting and tint. Do not overlay the custom shader's white/black contours, extra SVG sheen, BlurView or tint on it. Keep the component's rounded shape and geometry, while letting the system produce the material. Appearance controls, menus and the chat header remain frosted.

This is a deliberate platform-native implementation. It does not accept the App JSON's optical constants and is not a Metal port of the shared droplet shader. Exact cross-platform shader parity would still require a separate Metal/background integration. Report native builds and real-device visual checks separately; adopting the system API is not proof of identical output.

Native package changes require a fresh prebuild and CocoaPods resolution; a JS-only update cannot add the native module. The iOS build helper checks npm/Podfile inputs as well as Podfile.lock versus Manifest.lock, so adding a native package cannot silently reuse an old pod graph.

## Acceptance contract

Verify one rectangular control and one circular control on light, dark, nearly uniform, fine-grid, dense-text and colored backgrounds. Slow scrolling must show continuous liquid-like stretching and restoration at the edge. The center remains stable. Fine contours must join rounded corners without seams or a thick opaque frame. Check foreground contrast and input as well as the background optics.

Report actual backend and target-device checks. A Web preview and a native fallback must not be reported as the same completed implementation. Preserve the user's accepted presets and compare changes against that baseline.

## Reference documentation

- Android RuntimeShader and RenderEffect: https://developer.android.com/reference/android/graphics/RenderEffect
- Expo native system Liquid Glass: https://docs.expo.dev/versions/v57.0.0/sdk/glass-effect/
- Apple custom shaders and layerEffect: https://developer.apple.com/videos/play/wwdc2024/10151/
- html2canvas capture options: https://html2canvas.hertzen.com/configuration
- html2canvas supported CSS: https://html2canvas.hertzen.com/features

## Capture continuity and surface use

Capture the complete scrollable source at scroll offset zero and cache it; derive each surface's sample offset from current viewport geometry plus source scroll offset. Keep capture revision guards so asynchronous old captures cannot overwrite a newer layout. The controlled DOM adapter uses foreignObject rendering to preserve CSS circles, transforms and gradients. Validate CSP, images and fonts in each host browser.

Snapshot each WebGL render into its own ImageBitmap before reusing or resizing the shared OffscreenCanvas. A neighboring surface must never borrow a mutable drawing buffer. Out-of-capture pixels resolve to the scene base color instead of stretching the first or last texture row into a stripe. Composite source alpha over that base before material evaluation. These are capture/compositing rules, not artistic edge parameters.

In the mobile application, the floating chat composer and the home/session circular action buttons share the custom droplet material and App preset. Appearance controls, session long-press menus and the chat header use frosted blur with a restrained tint and a fine uniform contour. Keep the material assignment distinct: radius zero in the native backdrop selects blur only; the outer container still clips to its actual rounded shape. Modal backgrounds must resolve the original activity's source view across the separate Modal window, and the capture target must exclude the floating controls themselves.

For native list pages, extend the captured ambient background by the safe-area top and bottom insets so its gradients align with the full-window background behind the system bars. Restarting the gradient inside the safe area creates a visible seam. Keep the floating controls as siblings of the capture target.

On iOS, render the ambient gradient once at the full-window App root. Keep the chat capture/message container transparent and omit the Android-specific bottom fade overlay. KeyboardAvoidingView resizes only the content/composer layout; a duplicate gradient or ambient-color fade inside that resized region creates a horizontal seam against the unchanged home-indicator safe area. The native system glass samples the actual backdrop directly, so the duplicated capture background is unnecessary. Set TextInput keyboardAppearance to the resolved App theme.
