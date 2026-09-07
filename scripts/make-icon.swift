// Génère assets/icon-1024.png : squircle terracotta + organigramme à trois nœuds
// + étincelle IA. Usage : swift scripts/make-icon.swift <chemin de sortie>

import AppKit
import CoreGraphics
import Foundation

let size: CGFloat = 1024
let out = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "assets/icon-1024.png"

guard let ctx = CGContext(
  data: nil,
  width: Int(size),
  height: Int(size),
  bitsPerComponent: 8,
  bytesPerRow: 0,
  space: CGColorSpace(name: CGColorSpace.sRGB)!,
  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
) else {
  fatalError("contexte graphique indisponible")
}

ctx.setAllowsAntialiasing(true)
ctx.interpolationQuality = .high

// --- Squircle : marge façon icône macOS (le glyphe occupe ~80 % du canevas)
let inset: CGFloat = size * 0.098
let rect = CGRect(x: inset, y: inset, width: size - inset * 2, height: size - inset * 2)
let radius = rect.width * 0.2237
let squircle = CGPath(roundedRect: rect, cornerWidth: radius, cornerHeight: radius, transform: nil)

ctx.saveGState()
ctx.addPath(squircle)
ctx.clip()
// Terracotta, les teintes de l'app : l'accent du thème sombre (#d99b80) en
// haut à gauche, celui du thème clair (#a85f47) au milieu, puis un brun profond
// en bas à droite.
let colors = [
  CGColor(red: 0.851, green: 0.608, blue: 0.502, alpha: 1),
  CGColor(red: 0.659, green: 0.373, blue: 0.278, alpha: 1),
  CGColor(red: 0.216, green: 0.114, blue: 0.082, alpha: 1),
] as CFArray
let gradient = CGGradient(colorsSpace: CGColorSpace(name: CGColorSpace.sRGB)!,
                          colors: colors, locations: [0, 0.48, 1])!
ctx.drawLinearGradient(gradient,
                       start: CGPoint(x: rect.minX, y: rect.maxY),
                       end: CGPoint(x: rect.maxX, y: rect.minY),
                       options: [])

let glow = CGGradient(colorsSpace: CGColorSpace(name: CGColorSpace.sRGB)!,
                      colors: [CGColor(red: 1, green: 1, blue: 1, alpha: 0.14),
                               CGColor(red: 1, green: 1, blue: 1, alpha: 0)] as CFArray,
                      locations: [0, 1])!
ctx.drawRadialGradient(glow,
                       startCenter: CGPoint(x: rect.minX + rect.width * 0.28, y: rect.maxY - rect.height * 0.18),
                       startRadius: 0,
                       endCenter: CGPoint(x: rect.minX + rect.width * 0.28, y: rect.maxY - rect.height * 0.18),
                       endRadius: rect.width * 0.72,
                       options: [])
ctx.restoreGState()

// --- L'organigramme : un nœud en haut, deux en bas, reliés par une équerre.
let cx = size / 2 - size * 0.012
let haut = size * 0.680
let bas = size * 0.352
let ecart = size * 0.176
let rNoeud = size * 0.082
let trait = size * 0.050

ctx.saveGState()
ctx.setShadow(offset: CGSize(width: 0, height: -size * 0.012), blur: size * 0.036,
              color: CGColor(red: 0.13, green: 0.06, blue: 0.04, alpha: 0.32))
ctx.setStrokeColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
ctx.setLineWidth(trait)
ctx.setLineCap(.round)
ctx.setLineJoin(.round)

// Les liens : descente depuis l'orchestrateur, barre, puis deux descentes.
let palier = (haut + bas) / 2 + size * 0.010
ctx.move(to: CGPoint(x: cx, y: haut - rNoeud))
ctx.addLine(to: CGPoint(x: cx, y: palier))
ctx.move(to: CGPoint(x: cx - ecart, y: palier))
ctx.addLine(to: CGPoint(x: cx + ecart, y: palier))
ctx.move(to: CGPoint(x: cx - ecart, y: palier))
ctx.addLine(to: CGPoint(x: cx - ecart, y: bas + rNoeud))
ctx.move(to: CGPoint(x: cx + ecart, y: palier))
ctx.addLine(to: CGPoint(x: cx + ecart, y: bas + rNoeud))
ctx.strokePath()

// Les trois nœuds : l'orchestrateur plein, les pôles cerclés.
ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
ctx.addEllipse(in: CGRect(x: cx - rNoeud, y: haut - rNoeud, width: rNoeud * 2, height: rNoeud * 2))
ctx.fillPath()

for x in [cx - ecart, cx + ecart] {
  ctx.addEllipse(in: CGRect(x: x - rNoeud * 0.86, y: bas - rNoeud * 0.86,
                            width: rNoeud * 1.72, height: rNoeud * 1.72))
}
ctx.setLineWidth(trait * 0.92)
ctx.strokePath()
ctx.restoreGState()

// --- Étincelle (le côté « assistant »)
func sparkle(at center: CGPoint, radius r: CGFloat, alpha: CGFloat) {
  let waist = r * 0.30
  let path = CGMutablePath()
  path.move(to: CGPoint(x: center.x, y: center.y + r))
  path.addQuadCurve(to: CGPoint(x: center.x + r, y: center.y),
                    control: CGPoint(x: center.x + waist, y: center.y + waist))
  path.addQuadCurve(to: CGPoint(x: center.x, y: center.y - r),
                    control: CGPoint(x: center.x + waist, y: center.y - waist))
  path.addQuadCurve(to: CGPoint(x: center.x - r, y: center.y),
                    control: CGPoint(x: center.x - waist, y: center.y - waist))
  path.addQuadCurve(to: CGPoint(x: center.x, y: center.y + r),
                    control: CGPoint(x: center.x - waist, y: center.y + waist))
  path.closeSubpath()
  ctx.addPath(path)
  ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: alpha))
  ctx.fillPath()
}

sparkle(at: CGPoint(x: cx + size * 0.238, y: size * 0.712), radius: size * 0.062, alpha: 0.97)
sparkle(at: CGPoint(x: cx + size * 0.318, y: size * 0.806), radius: size * 0.030, alpha: 0.72)

// --- Écriture du PNG
guard let image = ctx.makeImage() else { fatalError("rendu impossible") }
let rep = NSBitmapImageRep(cgImage: image)
rep.size = NSSize(width: size, height: size)
guard let data = rep.representation(using: .png, properties: [:]) else { fatalError("encodage PNG impossible") }
try data.write(to: URL(fileURLWithPath: out))
print("icône écrite : \(out)")
