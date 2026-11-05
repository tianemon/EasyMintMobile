"""Generate the browser material from the accepted Android AGSL source."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
NATIVE = ROOT / 'modules/mint-lens/android/src/main/java/em/lens/LensModule.kt'
source = NATIVE.read_text().split('private const val SOURCE = """', 1)[1].split('"""', 1)[0]
source = source.replace('uniform shader backdrop;', '')
for kind, replacement in [('half4','vec4'),('half3','vec3'),('float3','vec3'),('float2','vec2'),('half','float')]:
    source = re.sub(r'\b'+kind+r'\b', replacement, source)
source = re.sub(r'uniform (vec2|float) (size|radius|bevel|refractionWidth|pixelScale|padding);',r'\1 \2;',source)
source = re.sub(r'(?m)^\s*(?:vec2|float) (?:size|radius|bevel|refractionWidth|pixelScale|padding);', '', source)
source = source.replace('backdrop.eval(', 'sampleCapture(')
source = source.replace('vec4 main(vec2 sourcePoint)', 'vec4 shadeGlass(vec2 sourcePoint)')
parameters = {
    'heightRatio': ('refractionWidth * 0.48', 'refractionWidth * u_heightRatio'),
    'normalStep': ('localWidth * 0.152', 'localWidth * u_normalStep'),
    'sideWidth': ('0.18 * lateralInfluence(p)', '(u_sideWidth - 1.0) * lateralInfluence(p)'),
    'sideRim': ('0.12 * lateral', '(u_sideRim - 1.0) * lateral'),
    'sideTravel': ('0.28 * lateral', '(u_sideTravel - 1.0) * lateral'),
    'travel': ('bevel * 0.86', 'bevel * u_travel'),
    'rimStrength': ('bevel * 0.13', 'bevel * u_rimStrength'),
    'rimRange': ('smoothstep(0.0, 0.40, rimDepth)', 'smoothstep(0.0, u_rimRange, rimDepth)'),
    'faceScale': ('* 0.988', '* u_faceScale'),
    'dispersion': ('edgeSupport * 0.003', 'edgeSupport * u_dispersion'),
    'rimDispersion': ('rimDispersion * 0.001', 'rimDispersion * u_rimDispersion'),
    'darkEdge': ('lateralWeight * 0.16', 'lateralWeight * u_darkEdge'),
    'brightEdge': ('horizontalWeight * 0.14', 'horizontalWeight * u_brightEdge'),
    'edgeCenter': ('pixelScale * 0.40', 'pixelScale * u_edgeCenter'),
    'edgeWidth': ('pixelScale * 0.30', 'pixelScale * u_edgeWidth'),
}
for name,(original,replacement) in parameters.items():
    if source.count(original) != 1:
        raise ValueError(f'{name}: expected exactly one native expression: {original}')
    source = source.replace(original,replacement)
source = source.replace('1.46', 'u_ior')
source = source.replace('0.24 + 0.76 * localContrast', '(0.24 + 0.76 * localContrast) * u_adaptation')
source = source.replace('section * (0.10 + 0.14 * localContrast)', 'section * (0.10 + 0.14 * localContrast) * u_environmentMix')
header = '''#version 300 es
precision highp float;
uniform sampler2D uBackdrop;
uniform sampler2D uScene;
uniform vec2 uViewport;
uniform vec4 uRects[2];
uniform float uRadii[2];
uniform float u_bevelRatio;
uniform float u_width;
uniform float u_tint;
uniform float u_referenceScale;
in vec2 vUv;
out vec4 fragColor;
'''
header += ''.join(f'uniform float u_{name};\n' for name in parameters)
header += 'vec2 size; float radius; float bevel; float refractionWidth; float pixelScale; float padding;\n'
header += '''uniform float u_ior;
uniform float u_adaptation;
uniform float u_environmentMix;
vec2 captureOrigin;
vec4 sampleCapture(vec2 uv) {
    vec2 globalPoint = captureOrigin + uv - padding;
    vec2 textureUV = clamp(globalPoint / (uViewport * u_referenceScale), vec2(0.001), vec2(0.999));
    return texture(uBackdrop, vec2(textureUV.x, 1.0 - textureUV.y));
}
'''
footer = '''
void main() {
    vec2 point = vec2(vUv.x, 1.0 - vUv.y) * uViewport * u_referenceScale;
    vec4 result = texture(uScene, vUv);
    for (int i = 0; i < 2; i++) {
        captureOrigin = uRects[i].xy * u_referenceScale;
        size = uRects[i].zw * u_referenceScale;
        radius = min(uRadii[i] * u_referenceScale, min(size.x, size.y) * 0.5);
        pixelScale = u_referenceScale;
        padding = 26.0 * u_referenceScale;
        bevel = size.y * u_bevelRatio;
        refractionWidth = bevel * u_width;
        vec2 localPoint = point - captureOrigin;
        float distance = surfaceDistance(localPoint);
        if (distance < 1.0) {
            vec4 glass = shadeGlass(localPoint + padding);
            // Glass.tsx places a black tint above the optical surface.
            glass.rgb *= 1.0 - u_tint;
            float coverage = 1.0 - smoothstep(-0.6, 0.6, distance);
            result = mix(result, glass, coverage);
        }
    }
    fragColor = result;
}
'''
output = Path(__file__).with_name('material.js')
output.write_text('// Generated from LensModule.kt by sync-shader.py.\nexport const materialFragment = '+repr(header+source+footer)+';\n')
print(output)
