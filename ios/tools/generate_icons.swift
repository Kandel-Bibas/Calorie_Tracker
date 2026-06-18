#!/usr/bin/env swift
//
// Renders the Calorie Tracker brand mark: an open orange→yellow activity ring
// with a single accent dot at the leading endpoint. This is the source of truth
// for the icon design — edit the constants below and rerun to regenerate.
//
// Usage:   swift tools/generate_icons.swift [assets-catalog-dir]
// Default assets-catalog-dir: CalorieTracker/Assets.xcassets  (run from ios/ root)
// Outputs (all 1024×1024):
//   <catalog>/AppIcon.appiconset/app-icon.png
//   <catalog>/AppLogo.imageset/app-logo.png
//   <catalog>/LaunchImage.imageset/launch-image.png
//
// Design rationale (Apple HIG, iOS 26 Liquid Glass):
//   - Solid, filled shapes — no outlines, no feathered edges.
//   - No baked-in highlights or shadows; the system applies them.
//   - Background is a flat linear gradient (warm peach); ring is a solid stroke
//     with a linear gradient fill. Ready to be split into Icon Composer layers.

import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

let catalogDir = URL(fileURLWithPath: CommandLine.arguments.count > 1
    ? CommandLine.arguments[1]
    : "CalorieTracker/Assets.xcassets")
let canvas: CGFloat = 1024
let colorSpace = CGColorSpaceCreateDeviceRGB()

// MARK: - Helpers

func makeContext(opaque: Bool) -> CGContext {
    let bm: UInt32 = opaque
        ? CGImageAlphaInfo.noneSkipLast.rawValue
        : CGImageAlphaInfo.premultipliedLast.rawValue
    let ctx = CGContext(
        data: nil,
        width: Int(canvas),
        height: Int(canvas),
        bitsPerComponent: 8,
        bytesPerRow: 0,
        space: colorSpace,
        bitmapInfo: bm
    )!
    // Flip so origin is top-left, +y goes down (matches image conventions
    // when the bitmap is encoded as PNG).
    ctx.translateBy(x: 0, y: canvas)
    ctx.scaleBy(x: 1, y: -1)
    return ctx
}

func savePNG(_ ctx: CGContext, to url: URL) {
    guard let img = ctx.makeImage(),
          let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil) else {
        FileHandle.standardError.write(Data("Failed to save \(url.path)\n".utf8))
        return
    }
    CGImageDestinationAddImage(dest, img, nil)
    CGImageDestinationFinalize(dest)
    print("Wrote \(url.path)")
}

// MARK: - Background

func drawWarmBackground(_ ctx: CGContext) {
    let colors = [
        CGColor(red: 1.000, green: 0.957, blue: 0.890, alpha: 1.0), // #FFF4E3 top
        CGColor(red: 1.000, green: 0.890, blue: 0.776, alpha: 1.0)  // #FFE3C6 bottom
    ] as CFArray
    let g = CGGradient(colorsSpace: colorSpace, colors: colors, locations: [0, 1])!
    // Flipped coords: y=0 is top of canvas.
    ctx.drawLinearGradient(
        g,
        start: CGPoint(x: canvas / 2, y: 0),
        end: CGPoint(x: canvas / 2, y: canvas),
        options: []
    )
}

// MARK: - Ring

// Draws the open activity ring + accent dot centered on the canvas. In flipped
// (y-down) coordinates: angle 0 = +x (right), π/2 = +y = down, -π/2 = up (12 o'clock).
func drawRing(_ ctx: CGContext, outerRadius: CGFloat, strokeWidth: CGFloat) {
    let center = CGPoint(x: canvas / 2, y: canvas / 2)
    let radius = outerRadius - strokeWidth / 2

    let gap: CGFloat = 28 * .pi / 180   // 28° gap centered at 12 o'clock
    let topAngle: CGFloat = -.pi / 2    // 12 o'clock in flipped coords
    let startAngle = topAngle + gap / 2 // just clockwise of 12
    let endAngle   = topAngle - gap / 2 + 2 * .pi // sweep almost all the way around

    let arc = CGMutablePath()
    // In flipped coords, clockwise:true draws screen-clockwise.
    arc.addArc(center: center, radius: radius,
               startAngle: startAngle, endAngle: endAngle, clockwise: false)

    // Stroke the path into a filled shape, then clip a gradient inside it.
    let stroked = arc.copy(strokingWithWidth: strokeWidth,
                           lineCap: .round, lineJoin: .round, miterLimit: 4)
    ctx.saveGState()
    ctx.addPath(stroked)
    ctx.clip()

    let colors = [
        CGColor(red: 1.000, green: 0.420, blue: 0.208, alpha: 1.0), // #FF6B35 orange
        CGColor(red: 1.000, green: 0.714, blue: 0.153, alpha: 1.0)  // #FFB627 yellow
    ] as CFArray
    let g = CGGradient(colorsSpace: colorSpace, colors: colors, locations: [0, 1])!
    // Orange at the bottom of the ring, yellow toward the top — gives the mark
    // a "warm-up to bright" read that points at the leading endpoint at the top.
    ctx.drawLinearGradient(
        g,
        start: CGPoint(x: canvas / 2, y: canvas - 120),
        end: CGPoint(x: canvas / 2, y: 120),
        options: [.drawsBeforeStartLocation, .drawsAfterEndLocation]
    )
    ctx.restoreGState()

    // Accent dot at the leading endpoint (the end of the arc, just left of 12).
    let dotAngle = endAngle.truncatingRemainder(dividingBy: 2 * .pi)
    let dotCenter = CGPoint(
        x: center.x + radius * cos(dotAngle),
        y: center.y + radius * sin(dotAngle)
    )
    let dotRadius = strokeWidth * 0.34
    ctx.setFillColor(red: 1.000, green: 0.804, blue: 0.314, alpha: 1.0) // soft amber
    ctx.beginPath()
    ctx.addArc(center: dotCenter, radius: dotRadius,
               startAngle: 0, endAngle: 2 * .pi, clockwise: false)
    ctx.fillPath()
}

// MARK: - Outputs

// app-icon.png — opaque, full bleed: warm peach gradient + centered ring.
do {
    let ctx = makeContext(opaque: true)
    drawWarmBackground(ctx)
    drawRing(ctx, outerRadius: 372, strokeWidth: 116)
    savePNG(ctx, to: catalogDir.appendingPathComponent("AppIcon.appiconset/app-icon.png"))
}

// app-logo.png — transparent: just the ring (for in-app brand uses).
do {
    let ctx = makeContext(opaque: false)
    drawRing(ctx, outerRadius: 372, strokeWidth: 116)
    savePNG(ctx, to: catalogDir.appendingPathComponent("AppLogo.imageset/app-logo.png"))
}

// launch-image.png — transparent, slightly smaller so it sits comfortably
// when centered on the launch background.
do {
    let ctx = makeContext(opaque: false)
    drawRing(ctx, outerRadius: 300, strokeWidth: 96)
    savePNG(ctx, to: catalogDir.appendingPathComponent("LaunchImage.imageset/launch-image.png"))
}
