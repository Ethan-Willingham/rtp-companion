import AppKit
let folder = URL(fileURLWithPath: CommandLine.arguments[1])
try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
for size in [16,32,128,256,512] {
    for scale in [1,2] {
        let px = size*scale
        let image = NSImage(size: NSSize(width:px,height:px)); image.lockFocus()
        let edge = CGFloat(px), inset = edge*0.07
        NSColor(calibratedRed:0.08,green:0.17,blue:0.13,alpha:1).setFill()
        NSBezierPath(roundedRect:NSRect(x:inset,y:inset,width:edge-2*inset,height:edge-2*inset),xRadius:edge*0.19,yRadius:edge*0.19).fill()
        NSColor(calibratedRed:0.3,green:0.48,blue:0.34,alpha:1).setStroke()
        let grid = NSBezierPath(); grid.lineWidth = max(1,edge*0.012)
        for i in 1...3 {let q = edge*(0.2+CGFloat(i)*0.15);grid.move(to:NSPoint(x:q,y:edge*0.2));grid.line(to:NSPoint(x:q,y:edge*0.8));grid.move(to:NSPoint(x:edge*0.2,y:q));grid.line(to:NSPoint(x:edge*0.8,y:q))};grid.stroke()
        let ring = NSBezierPath(ovalIn:NSRect(x:edge*0.34,y:edge*0.34,width:edge*0.32,height:edge*0.32))
        NSColor(calibratedRed:0.88,green:0.77,blue:0.49,alpha:1).setStroke();ring.lineWidth = edge*0.06;ring.stroke()
        NSColor(calibratedRed:0.96,green:0.93,blue:0.82,alpha:1).setFill();NSBezierPath(ovalIn:NSRect(x:edge*0.46,y:edge*0.46,width:edge*0.08,height:edge*0.08)).fill()
        image.unlockFocus()
        let bitmap = NSBitmapImageRep(data:image.tiffRepresentation!)!
        let name = "icon_\(size)x\(size)\(scale==2 ? "@2x" : "").png"
        try bitmap.representation(using:.png,properties:[:])!.write(to:folder.appendingPathComponent(name))
    }
}
