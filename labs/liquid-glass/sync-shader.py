"""Generate the browser material from the shipped Android AGSL asset."""
from pathlib import Path
import re, json
ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / 'modules/mint-lens/android/src/main/assets'
source = (ASSETS / 'em-liquid-material.agsl').read_text().replace('uniform shader backdrop;', '')
for kind, replacement in [('half4','vec4'),('half3','vec3'),('float3','vec3'),('float2','vec2'),('half','float')]:
    source = re.sub(r'\b'+kind+r'\b', replacement, source)
source = re.sub(r'(?m)^\s*uniform (?:vec2|float) (?:size|radius|bevel|refractionWidth|pixelScale|padding);', '', source)
source = source.replace('backdrop.eval(', 'sampleCapture(').replace('vec4 main(vec2 sourcePoint)', 'vec4 shadeGlass(vec2 sourcePoint)')

header = '#version 300 es\nprecision highp float;\nuniform sampler2D uBackdrop;\nuniform sampler2D uScene;\nuniform vec2 uViewport;\nuniform vec4 uRects[2];\nuniform float uRadii[2];\nuniform float u_bevelRatio;\nuniform float u_width;\nuniform float u_tint;\nuniform float u_referenceScale;\nin vec2 vUv;\nout vec4 fragColor;\nvec2 size; float radius; float bevel; float refractionWidth; float pixelScale; float padding;\nvec2 captureOrigin;\nvec4 sampleCapture(vec2 uv) {\n    vec2 globalPoint = captureOrigin + uv - padding;\n    vec2 textureUV = clamp(globalPoint / (uViewport * u_referenceScale), vec2(0.001), vec2(0.999));\n    return texture(uBackdrop, vec2(textureUV.x, 1.0 - textureUV.y));\n}\n'
footer = '\nvoid main() {\n    vec2 point = vec2(vUv.x, 1.0 - vUv.y) * uViewport * u_referenceScale;\n    vec4 result = texture(uScene, vUv);\n    for (int i = 0; i < 2; i++) {\n        captureOrigin = uRects[i].xy * u_referenceScale;\n        size = uRects[i].zw * u_referenceScale;\n        radius = min(uRadii[i] * u_referenceScale, min(size.x, size.y) * 0.5);\n        pixelScale = u_referenceScale;\n        padding = 26.0 * u_referenceScale;\n        bevel = size.y * u_bevelRatio;\n        refractionWidth = bevel * u_width;\n        vec2 localPoint = point - captureOrigin;\n        float distance = surfaceDistance(localPoint);\n        if (distance < 1.0) {\n            vec4 glass = shadeGlass(localPoint + padding);\n            // Glass.tsx places a black tint above the optical surface.\n            glass.rgb *= 1.0 - u_tint;\n            float coverage = 1.0 - smoothstep(-0.6, 0.6, distance);\n            result = mix(result, glass, coverage);\n        }\n    }\n    fragColor = result;\n}\n'

output = Path(__file__).with_name('material.js')
output.write_text('// Generated from the Android material asset.\nexport const materialFragment = '+json.dumps(header+source+footer)+';\n')
preset = json.loads((ASSETS/'em-liquid-app.json').read_text())
Path(__file__).with_name('app-preset.js').write_text('export const APP_PRESET = '+json.dumps(preset,ensure_ascii=False,indent=2)+';\n')
print(output)
