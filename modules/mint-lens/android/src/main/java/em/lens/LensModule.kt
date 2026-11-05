package em.lens

import android.content.Context
import android.graphics.Shader
import android.graphics.Canvas
import android.graphics.RenderNode
import android.graphics.Color
import android.graphics.PorterDuff
import android.view.View
import android.graphics.RenderEffect
import android.graphics.RuntimeShader
import android.os.Build
import androidx.annotation.RequiresApi
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.views.ExpoView

class LensModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("MintLens")
    View(LensView::class) {
      Prop("targetTag") { view: LensView, tag: Int? -> view.targetTag = tag }
      Prop("radius") { view: LensView, radius: Float -> view.setRadiusDp(radius) }
    }
  }
}

class LensView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  var targetTag: Int? = null
    set(value) { field = value; invalidate() }
  private var configuredWidth = 0
  private var configuredHeight = 0
  private var configuredRadius = -1f
  private var cornerDp = 0f
  private val targetLocation = IntArray(2)
  private val ownLocation = IntArray(2)
  private var sourceNode: RenderNode? = null

  init { setWillNotDraw(false) }

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    if (Build.VERSION.SDK_INT < 33 || !canvas.isHardwareAccelerated || width == 0 || height == 0) return
    val target = targetTag?.let { rootView.findViewById<View>(it) } ?: return
    if (target === this) return
    val node = sourceNode ?: RenderNode("MintLensBackdrop").also { sourceNode = it }
    target.getLocationOnScreen(targetLocation)
    getLocationOnScreen(ownLocation)
    // Keep pixels beyond the glass silhouette available to the curved rim.
    val padding = (26 * resources.displayMetrics.density).toInt()
    node.setPosition(-padding, -padding, width + padding, height + padding)
    val recording = node.beginRecording(width + padding * 2, height + padding * 2)
    try {
      recording.drawColor(Color.TRANSPARENT, PorterDuff.Mode.CLEAR)
      recording.translate((targetLocation[0] - ownLocation[0] + padding).toFloat(), (targetLocation[1] - ownLocation[1] + padding).toFloat())
      target.draw(recording)
    } finally {
      node.endRecording()
    }
    if (configuredWidth != width || configuredHeight != height || configuredRadius != cornerDp) {
      Optics.applyToNode(node, width, height, cornerDp * resources.displayMetrics.density, resources.displayMetrics.density)
      configuredWidth = width
      configuredHeight = height
      configuredRadius = cornerDp
    }
    // The enlarged sampling buffer must never paint outside the actual surface.
    canvas.save()
    canvas.clipRect(0, 0, width, height)
    canvas.drawRenderNode(node)
    canvas.restore()
    postInvalidateDelayed(33)
  }

  override fun onDetachedFromWindow() {
    sourceNode?.discardDisplayList()
    sourceNode = null
    configuredWidth = 0
    super.onDetachedFromWindow()
  }
  fun setRadiusDp(value: Float) {
    cornerDp = value
    refreshLens()
  }

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    refreshLens()
  }

  private fun refreshLens() { invalidate() }

}

@RequiresApi(33)
private object Optics {
  // Only the backdrop layer is sampled. Text and touch targets are siblings above it.
  private const val SOURCE = """
    uniform shader backdrop;
    uniform float2 size;
    uniform float radius;
    uniform float bevel;
    uniform float refractionWidth;
    uniform float pixelScale;
    uniform float padding;

    half4 sampleBackground(float2 uv) {
      return backdrop.eval(clamp(uv + padding, float2(0.5), size + padding * 2.0 - 0.5));
    }

    half3 backgroundColorAt(float2 p) {
      // Preserve the capture-edge fix for every neighborhood sample.
      half4 sampled = sampleBackground(clamp(p, float2(0.5), size - 0.5));
      return sampled.a > 0.001
        ? sampled.rgb / sampled.a : sampleBackground(size * 0.5).rgb;
    }

    float luminance(half3 color) {
      return dot(float3(color), float3(0.2126, 0.7152, 0.0722));
    }

    float surfaceDistance(float2 p) {
      float2 q = abs(p - size * 0.5) - size * 0.5 + radius;
      return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
    }

    float lateralInfluence(float2 p) {
      float2 q = abs(p - size * 0.5) - size * 0.5 + radius;
      float2 corner = max(q, 0.0);
      float cornerLength = length(corner);
      float2 axis = q.x > q.y ? float2(1, 0) : float2(0, 1);
      float2 direction = cornerLength > 0.001 ? corner / max(cornerLength, 0.001) : axis;
      return direction.x * direction.x;
    }

    float localRefractionWidth(float2 p) {
      return refractionWidth * (1.0 + 0.18 * lateralInfluence(p));
    }

    float surfaceHeight(float2 p) {
      float t = clamp(-surfaceDistance(p) / localRefractionWidth(p), 0.0, 1.0);
      return refractionWidth * 0.48 * sqrt(max(0.0, 1.0 - (1.0 - t) * (1.0 - t)));
    }

    float2 trace(float2 p, float3 normal, float height, float ior) {
      float3 inside = refract(float3(0, 0, -1), normal, 1.0 / ior);
      float2 back = p + inside.xy * height / max(-inside.z, 0.025);
      float3 outside = refract(inside, float3(0, 0, 1), ior);
      // Extra rim lens joins the existing refraction with a zero-slope taper.
      float lateral = lateralInfluence(p);
      float rimDepth = max(-surfaceDistance(p), 0.0) / localRefractionWidth(p);
      float rimLens = 1.0 - smoothstep(0.0, 0.40, rimDepth);
      float2 bendDirection = normal.xy / max(length(normal.xy), 0.001);
      float2 rimOffset = -bendDirection * bevel * 0.13 * (1.0 + 0.12 * lateral) *
                        rimLens * rimLens * ((ior - 1.0) / 0.46);
      return clamp(back + outside.xy * (bevel * 0.86 * (1.0 + 0.28 * lateral)) / max(-outside.z, 0.025) + rimOffset,
                   float2(0.5 - padding), size + padding - 0.5);
    }

    half4 main(float2 sourcePoint) {
      float2 p = sourcePoint - padding;
      // Radius zero is the frosted title/status bar, with no curved surface.
      if (radius < 0.1) return sampleBackground(p);
      float2 v = p - size * 0.5;
      float2 q = abs(v) - size * 0.5 + radius;
      float2 corner = max(q, 0.0);
      float cornerLength = length(corner);
      float distance = cornerLength + min(max(q.x, q.y), 0.0) - radius;
      float2 axis = q.x > q.y ? float2(1, 0) : float2(0, 1);
      float2 outward = sign(v) * (cornerLength > 0.001 ? corner / max(cornerLength, 0.001) : axis);
      float depth = max(-distance, 0.0);
      float t = clamp(depth / bevel, 0.0, 1.0);
      // Broader lateral shoulders keep a common flat-face height, avoiding a
      // center ridge while the side refraction rolls smoothly through corners.
      float localWidth = localRefractionWidth(p);
      float height = surfaceHeight(p);
      float stepSize = localWidth * 0.152;
      float2 gradient = float2(
        surfaceHeight(p + float2(stepSize, 0)) - surfaceHeight(p - float2(stepSize, 0)),
        surfaceHeight(p + float2(0, stepSize)) - surfaceHeight(p - float2(0, stepSize))
      ) / (2.0 * stepSize);
      float3 normal = normalize(float3(-gradient, 1.0));
      float2 greenUV = trace(p, normal, height, 1.46);
      float2 faceUV = size * 0.5 + (p - size * 0.5) * 0.988;
      float refractionT = clamp(depth / localWidth, 0.0, 1.0);
      float edgeBlend = 1.0 - smoothstep(0.65, 1.0, refractionT);
      half4 color = sampleBackground(mix(faceUV, greenUV, edgeBlend));
      float edgeSupport = 1.0 - smoothstep(0.45, 1.0, refractionT);
      float rimDispersion = 1.0 - smoothstep(0.0, 0.45, refractionT);
      float dispersion = edgeSupport * 0.003 + rimDispersion * 0.001;
      color.r = mix(color.r, sampleBackground(trace(p, normal, height, 1.46 - dispersion)).r, half(edgeBlend));
      color.b = mix(color.b, sampleBackground(trace(p, normal, height, 1.46 + dispersion)).b, half(edgeBlend));

      float sectionWidth = bevel * 0.36;
      float2 tangent = float2(-outward.y, outward.x) * bevel * 0.22;
      float2 exteriorPoint = p + outward * sectionWidth;
      half3 environment = (backgroundColorAt(exteriorPoint) * half(2.0) +
        backgroundColorAt(exteriorPoint + tangent) +
        backgroundColorAt(exteriorPoint - tangent)) * half(0.25);
      half3 interior = (backgroundColorAt(p - outward * sectionWidth) * half(2.0) +
        backgroundColorAt(p - outward * sectionWidth + tangent) +
        backgroundColorAt(p - outward * sectionWidth - tangent)) * half(0.25);
      float exteriorLuma = luminance(environment);
      float interiorLuma = luminance(interior);
      float localContrast = smoothstep(0.015, 0.18, abs(exteriorLuma - interiorLuma));
      // Preserve the previous scene-adaptive material.
      float edgeActivity = 0.24 + 0.76 * localContrast;
      float lightSide = 1.0 - smoothstep(0.18, 0.82, exteriorLuma);
      float darkSide = smoothstep(0.18, 0.82, exteriorLuma);
      float section = 1.0 - smoothstep(bevel * 0.04, sectionWidth, depth);
      color.rgb = mix(color.rgb, environment, half(section * (0.10 + 0.14 * localContrast)));
      color.rgb *= half(1.0 - section * (0.035 + 0.12 * darkSide) * edgeActivity);
      float outerDark = exp(-depth / (bevel * 0.044)) *
                        (0.045 + 0.11 * darkSide) * edgeActivity;
      color.rgb *= half(1.0 - outerDark);
      float innerDistance = (depth - bevel * 0.072) / (bevel * 0.04);
      float innerLight = exp(-innerDistance * innerDistance);
      color.rgb += half(innerLight * (0.025 + 0.20 * lightSide) * edgeActivity) *
                   mix(half3(1.0), environment, half(0.35)) * color.a;
      float shoulderDistance = (depth - bevel * 0.20) / (bevel * 0.12);
      float shoulder = exp(-shoulderDistance * shoulderDistance) *
                       0.035 * lightSide * edgeActivity;
      color.rgb += half(shoulder) * mix(half3(1.0), environment, half(0.55)) * color.a;

      // Sub-pixel dark contour on the two lateral edges, fading around the corners.
      float lateralWeight = pow(abs(outward.x), 4.0);
      float lateralDistance = (depth - pixelScale * 0.40) / max(pixelScale * 0.30, 0.75);
      float lateralShadow = exp(-lateralDistance * lateralDistance) * lateralWeight * 0.16;
      color.rgb *= half(1.0 - lateralShadow);
      // The same fine contour profile lights the horizontal edges. Both contour
      // weights fade smoothly through each corner, without a full white frame.
      float horizontalWeight = pow(abs(outward.y), 4.0);
      float horizontalHighlight = exp(-lateralDistance * lateralDistance) *
                                  horizontalWeight * 0.14;
      color.rgb = mix(color.rgb, half3(color.a), half(horizontalHighlight));
      // Match the web shader's SDF mask rather than relying on the RN clip.
      // Pixels outside the optical contour retain the unshaded background.
      float coverage = 1.0 - smoothstep(-0.75, 0.75, distance);
      return mix(sampleBackground(p), color, half(coverage));
    }"""
  fun applyToNode(node: RenderNode, width: Int, height: Int, radius: Float, dp: Float) {
    val shader = RuntimeShader(SOURCE)
    shader.setFloatUniform("pixelScale", dp)
    shader.setFloatUniform("padding", (26 * dp).toInt().toFloat())
    shader.setFloatUniform("size", width.toFloat(), height.toFloat())
    shader.setFloatUniform("radius", radius.coerceAtMost(minOf(width, height) / 2f))
    val bevelWidth = height * (0.025f / 0.244f)
    shader.setFloatUniform("bevel", bevelWidth)
    shader.setFloatUniform("refractionWidth", bevelWidth * 1.32f)
    val lens = RenderEffect.createRuntimeShaderEffect(shader, "backdrop")
    val blur = RenderEffect.createBlurEffect(if (radius < 1f) 8 * dp else 0.65f * dp, if (radius < 1f) 8 * dp else 0.65f * dp, Shader.TileMode.CLAMP)
    node.setRenderEffect(RenderEffect.createChainEffect(lens, blur))
  }
}
