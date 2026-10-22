import AppKit
import Vision
import ScreenCaptureKit
import ImageIO

struct Position: Equatable {
    let x: Double, y: Double, z: Double
    func distance(_ other: Position) -> Double { hypot(x - other.x, z - other.z) }
}

enum Reader {
    static func parse(_ text: String) -> Position? {
        let s = text.replacingOccurrences(of: "−", with: "-").replacingOccurrences(of: "XY2", with: "XYZ").trimmingCharacters(in: .whitespacesAndNewlines)
        let n = #"(-?\d{1,8}(?:\.\d+)?)"#
        let pattern = #"^(?:XYZ|Block)\s*:?\s*"# + n + #"\s*(?:/|,|\s)\s*"# + n + #"\s*(?:/|,|\s)\s*"# + n + #"(?:\s*\[.*\])?\s*$"#
        guard let re = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive),
              let m = re.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)) else { return nil }
        let values = (1...3).compactMap { Range(m.range(at: $0), in: s).flatMap { Double(s[$0]) } }
        guard values.count == 3, abs(values[0]) <= 30_000_000, abs(values[2]) <= 30_000_000, (-2048...4096).contains(values[1]) else { return nil }
        return Position(x: values[0], y: values[1], z: values[2])
    }

    static func recognize(_ image: CGImage) throws -> (Position, String)? {
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = false
        request.recognitionLanguages = ["en-US"]
        request.minimumTextHeight = 0.006
        // Java's debug coordinates appear in the upper left of the game window.
        request.regionOfInterest = CGRect(x: 0, y: 0.12, width: 0.82, height: 0.88)
        try VNImageRequestHandler(cgImage: image).perform([request])
        // Vision can split XYZ and slash-separated values into several boxes.
        // Rejoin only boxes on the same baseline, from left to right.
        let observations = (request.results ?? []).filter { ($0.topCandidates(1).first?.confidence ?? 0) >= 0.45 }
        var blocks: [(Position, String)] = []
        for anchor in observations {
            guard let label = anchor.topCandidates(1).first?.string else { continue }
            let lower = label.lowercased()
            guard lower.hasPrefix("xyz") || lower.hasPrefix("xy2") || lower.hasPrefix("block") else { continue }
            let box = anchor.boundingBox
            let row = observations.filter { o in
                o.boundingBox.minX >= box.minX - 0.002 && abs(o.boundingBox.midY-box.midY) < max(o.boundingBox.height,box.height)*0.45
            }.sorted { $0.boundingBox.minX < $1.boundingBox.minX }
            var combined = ""
            for part in row {
                guard let value = part.topCandidates(1).first?.string else { continue }
                combined += (combined.isEmpty ? "" : " ") + value
                guard let p = parse(combined) else { continue }
                if lower.hasPrefix("xy") { return (p,combined) }
                blocks.append((p,combined)); break
            }
        }
        return blocks.count == 1 ? blocks.first : nil
    }
}

struct Heatmap: Decodable {
    struct Grid: Decodable { let minX: Double, maxX: Double, minZ: Double, maxZ: Double; let width: Int, height: Int }
    struct Cell: Decodable { let cellX: Int, cellZ: Int, rtpCount: Int }
    let grid: Grid, cells: [Cell], totalRtps: Int
    let generatedAt: String
    func image() -> CGImage? {
        let w = grid.width, h = grid.height
        guard (1...3000).contains(w), (1...3000).contains(h), grid.maxX > grid.minX, grid.maxZ > grid.minZ else { return nil }
        var pixels = [UInt8](repeating: 255, count: w * h * 4)
        for i in stride(from: 0, to: pixels.count, by: 4) { pixels[i] = 20; pixels[i+1] = 36; pixels[i+2] = 32 }
        let maximum = Double(max(1, cells.map(\.rtpCount).max() ?? 1))
        let stops: [[Double]] = [[24,44,43],[86,141,117],[223,189,114],[242,230,202]]
        for c in cells where (0..<w).contains(c.cellX) && (0..<h).contains(c.cellZ) && c.rtpCount >= 0 {
            let t = log1p(Double(c.rtpCount)) / log1p(maximum) * 3
            let j = min(2, Int(t)), f = t - Double(j), index = (c.cellZ * w + c.cellX) * 4
            for k in 0..<3 { pixels[index+k] = UInt8(max(0, min(255, stops[j][k] + (stops[j+1][k] - stops[j][k]) * f))) }
        }
        let data = Data(pixels) as CFData
        guard let provider = CGDataProvider(data: data) else { return nil }
        return CGImage(width: w, height: h, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: w*4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue), provider: provider, decode: nil, shouldInterpolate: false, intent: .defaultIntent)
    }
}

struct RegionMap: Decodable {
    struct Grid: Decodable { let minX: Double, minZ: Double, cellSize: Double; let width: Int, height: Int }
    struct Cell: Decodable { let cellX: Int, cellZ: Int; let region: String? }
    let grid: Grid, cells: [Cell]
    static let names = ["west":"US West", "east":"US East", "eu central":"EU Central", "eu west":"EU West", "asia":"Asia", "oceania":"Oceania"]
    var lookup: [Int:String] {
        var result: [Int:String] = [:]
        for c in cells where c.cellX >= 0 && c.cellX < grid.width && c.cellZ >= 0 && c.cellZ < grid.height {
            if let region = c.region { result[c.cellZ*grid.width+c.cellX] = region }
        }
        return result
    }
    func region(at p: Position) -> String? {
        guard grid.cellSize > 0 else { return nil }
        let x = Int(floor((p.x-grid.minX)/grid.cellSize)), z = Int(floor((p.z-grid.minZ)/grid.cellSize))
        guard (0..<grid.width).contains(x), (0..<grid.height).contains(z) else { return nil }
        return lookup[z*grid.width+x]
    }
    func labelCells() -> [Cell] {
        let owners = lookup
        // Choose an interior tile in each region instead of a centroid that
        // might fall outside its irregular outline.
        return Self.names.keys.sorted().compactMap { name in
            let owned = cells.filter { $0.region == name }
            guard !owned.isEmpty else { return nil }
            let cx = owned.reduce(0.0) { $0+Double($1.cellX) }/Double(owned.count)
            let cz = owned.reduce(0.0) { $0+Double($1.cellZ) }/Double(owned.count)
            func score(_ c: Cell) -> Double {
                var depth = 1
                while depth < max(grid.width, grid.height) {
                    let d = depth
                    var surrounded = true
                    for x in (c.cellX-d)...(c.cellX+d) {
                        for z in [c.cellZ-d,c.cellZ+d] {
                            if x < 0 || x >= grid.width || z < 0 || z >= grid.height || owners[z*grid.width+x] != name { surrounded = false }
                        }
                    }
                    for z in (c.cellZ-d)...(c.cellZ+d) {
                        for x in [c.cellX-d,c.cellX+d] {
                            if x < 0 || x >= grid.width || z < 0 || z >= grid.height || owners[z*grid.width+x] != name { surrounded = false }
                        }
                    }
                    if !surrounded { break }; depth += 1
                }
                return Double(depth)*1000-hypot(Double(c.cellX)-cx,Double(c.cellZ)-cz)
            }
            return owned.max { score($0) < score($1) }
        }
    }
}

final class MapView: NSView {
    override var isFlipped: Bool { true }
    var heat: CGImage?
    var regions: RegionMap?
    var regionLabels: [RegionMap.Cell] = []
    let regionColors: [String:NSColor] = ["west":NSColor(calibratedRed:0.91,green:0.76,blue:0.49,alpha:1),"east":NSColor(calibratedRed:0.57,green:0.76,blue:0.89,alpha:1),"eu central":NSColor(calibratedRed:0.77,green:0.64,blue:0.88,alpha:1),"eu west":NSColor(calibratedRed:0.91,green:0.64,blue:0.58,alpha:1),"asia":NSColor(calibratedRed:0.61,green:0.86,blue:0.67,alpha:1),"oceania":NSColor(calibratedRed:0.87,green:0.79,blue:0.65,alpha:1)]
    var grid = Heatmap.Grid(minX: -225000, maxX: 225000, minZ: -225000, maxZ: 225000, width: 900, height: 900)
    var position: Position?
    var landings: [Position] = []
    var fresh = false
    var dimension = 0
    var zoom: CGFloat = 1
    var center = CGPoint(x: 0.5, y: 0.5)
    var previous: CGPoint?
    var follow = false
    var square: CGRect { let side = min(bounds.width, bounds.height); return CGRect(x: (bounds.width-side)/2, y: (bounds.height-side)/2, width: side, height: side) }
    func project(_ x: Double, _ z: Double) -> CGPoint {
        let s = square
        return CGPoint(x: s.midX + ((x-grid.minX)/(grid.maxX-grid.minX)-center.x)*s.width*zoom, y: s.midY + ((z-grid.minZ)/(grid.maxZ-grid.minZ)-center.y)*s.height*zoom)
    }
    func followPosition() {
        if let p = position { center = CGPoint(x: (p.x-grid.minX)/(grid.maxX-grid.minX), y: (p.z-grid.minZ)/(grid.maxZ-grid.minZ)) }
    }
    override func draw(_ dirtyRect: NSRect) {
        NSColor(calibratedRed: 0.06, green: 0.10, blue: 0.08, alpha: 1).setFill(); bounds.fill()
        NSGraphicsContext.saveGraphicsState(); NSBezierPath(rect: square).addClip()
        let a = project(grid.minX, grid.minZ), b = project(grid.maxX, grid.maxZ)
        let r = CGRect(x: a.x, y: a.y, width: b.x-a.x, height: b.y-a.y)
        if let heat, dimension == 0 {
            NSGraphicsContext.current?.imageInterpolation = .none
            NSImage(cgImage: heat, size: NSSize(width: heat.width, height: heat.height)).draw(in: r, from: .zero, operation: .sourceOver, fraction: 1, respectFlipped: true, hints: nil)
        }
        if dimension == 0 { drawRegions() }
        let origin = project(0, 0), axes = NSBezierPath(); axes.setLineDash([4,5], count: 2, phase: 0)
        axes.move(to: NSPoint(x: origin.x, y: square.minY)); axes.line(to: NSPoint(x: origin.x, y: square.maxY))
        axes.move(to: NSPoint(x: square.minX, y: origin.y)); axes.line(to: NSPoint(x: square.maxX, y: origin.y))
        NSColor.white.withAlphaComponent(0.3).setStroke(); axes.stroke()
        NSColor(calibratedRed: 0.85, green: 0.77, blue: 0.57, alpha: 1).setFill()
        for p in landings { let q = project(p.x,p.z); NSBezierPath(ovalIn: CGRect(x: q.x-3, y: q.y-3, width: 6, height: 6)).fill() }
        if let p = position {
            let q = project(p.x,p.z)
            let ring = NSBezierPath(ovalIn: CGRect(x: q.x-8, y: q.y-8, width: 16, height: 16))
            NSColor.black.setStroke(); ring.lineWidth = 6; ring.stroke()
            (fresh ? NSColor.white : NSColor.systemOrange).setStroke(); ring.lineWidth = 3; ring.stroke()
            NSColor.white.setFill(); NSBezierPath(ovalIn: CGRect(x: q.x-2, y: q.y-2, width: 4, height: 4)).fill()
        }
        let note = dimension == 0 ? "-Z / NORTH" : "\(["Overworld","Nether","End"][dimension]): coordinate grid only"
        (note as NSString).draw(at: NSPoint(x: square.minX+10, y: square.minY+10), withAttributes: [.font: NSFont.monospacedSystemFont(ofSize: 11, weight: .medium), .foregroundColor: NSColor.white, .backgroundColor: NSColor.black.withAlphaComponent(0.65)])
        NSGraphicsContext.restoreGraphicsState()
    }
    func drawRegions() {
        guard let regions else { return }
        let g = regions.grid, owners = regions.lookup
        for cell in regions.cells {
            guard let name = cell.region else { continue }
            let color = regionColors[name] ?? .white
            let x = g.minX+Double(cell.cellX)*g.cellSize, z = g.minZ+Double(cell.cellZ)*g.cellSize
            let a = project(x,z), b = project(x+g.cellSize,z+g.cellSize)
            color.withAlphaComponent(0.07).setFill(); CGRect(x:a.x,y:a.y,width:b.x-a.x,height:b.y-a.y).fill()
            let border = NSBezierPath()
            for (dx,dz,ax,az,bx,bz) in [(-1,0,x,z,x,z+g.cellSize),(1,0,x+g.cellSize,z,x+g.cellSize,z+g.cellSize),(0,-1,x,z,x+g.cellSize,z),(0,1,x,z+g.cellSize,x+g.cellSize,z+g.cellSize)] {
                let nx = cell.cellX+dx, nz = cell.cellZ+dz
                if (0..<g.width).contains(nx) && (0..<g.height).contains(nz) && owners[nz*g.width+nx] == name { continue }
                border.move(to:project(ax,az)); border.line(to:project(bx,bz))
            }
            NSColor.black.withAlphaComponent(0.65).setStroke(); border.lineWidth = 3; border.stroke()
            color.withAlphaComponent(0.85).setStroke(); border.lineWidth = 1; border.stroke()
        }
        for cell in regionLabels {
            guard let name = cell.region, let label = RegionMap.names[name] else { continue }
            let point = project(g.minX+(Double(cell.cellX)+0.5)*g.cellSize,g.minZ+(Double(cell.cellZ)+0.5)*g.cellSize)
            let attributes: [NSAttributedString.Key:Any] = [.font:NSFont.systemFont(ofSize:11,weight:.bold),.foregroundColor:regionColors[name] ?? NSColor.white]
            let size = (label as NSString).size(withAttributes:attributes)
            let rect = CGRect(x:point.x-size.width/2-7,y:point.y-size.height/2-5,width:size.width+14,height:size.height+10)
            guard square.contains(rect) else { continue }
            NSColor(calibratedRed:0.05,green:0.09,blue:0.07,alpha:0.94).setFill()
            let pill = NSBezierPath(roundedRect:rect,xRadius:5,yRadius:5); pill.fill()
            (regionColors[name] ?? NSColor.white).withAlphaComponent(0.75).setStroke(); pill.lineWidth = 1; pill.stroke()
            (label as NSString).draw(at:CGPoint(x:rect.minX+7,y:rect.minY+5),withAttributes:attributes)
        }
    }
    override func mouseDown(with event: NSEvent) { previous = convert(event.locationInWindow, from: nil) }
    override func mouseDragged(with event: NSEvent) {
        let p = convert(event.locationInWindow, from: nil)
        if let old = previous { center.x -= (p.x-old.x)/(square.width*zoom); center.y -= (p.y-old.y)/(square.height*zoom); follow = false }
        previous = p; needsDisplay = true
    }
    override func mouseUp(with event: NSEvent) { previous = nil }
    override func scrollWheel(with event: NSEvent) { zoom = max(1,min(128,zoom * (event.scrollingDeltaY > 0 ? 1.12 : 0.89))); needsDisplay = true }
}

@MainActor final class Controller: NSObject, NSApplicationDelegate {
    var window: NSWindow!
    let start = NSButton(title: "Start tracking", target: nil, action: nil)
    let settings = NSButton(title: "Screen Recording Settings", target: nil, action: nil)
    let status = NSTextField(wrappingLabelWithString: "Open Minecraft, show F3 coordinates, then click Start tracking.")
    let coords = NSTextField(labelWithString: "X: ---    Y: ---    Z: ---")
    let regionStatus = NSTextField(labelWithString: "Region: waiting for coordinates")
    let info = NSTextField(wrappingLabelWithString: "Loading the public RTP map...")
    let windows = NSPopUpButton(frame: .zero, pullsDown: false)
    let dimension = NSPopUpButton(frame: .zero, pullsDown: false)
    let map = MapView()
    let preview = NSTextField(wrappingLabelWithString: "Your screen is read locally. No Minecraft mods, files, memory or controls are accessed.")
    var targets: [SCWindow] = []
    var target: SCWindow?
    var running = false, busy = false, awaitingPermission = false
    var epoch = 0
    var pending: Position?
    var pendingTime = Date.distantPast
    var lastRead = Date.distantPast
    var timer: Timer?

    func applicationDidFinishLaunching(_ notification: Notification) {
        let menu = NSMenu(); let appItem = NSMenuItem(); menu.addItem(appItem)
        let appMenu = NSMenu(); appMenu.addItem(withTitle: "About RTP Companion", action: #selector(about), keyEquivalent: "")
        appMenu.addItem(.separator()); appMenu.addItem(withTitle: "Quit RTP Companion", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"); appItem.submenu = appMenu; NSApp.mainMenu = menu
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 650, height: 830), styleMask: [.titled,.closable,.miniaturizable,.resizable], backing: .buffered, defer: false)
        window.title = "RTP Companion"; window.minSize = NSSize(width: 470, height: 650)
        window.appearance = NSAppearance(named: .darkAqua)
        window.backgroundColor = NSColor(calibratedRed: 0.07, green: 0.12, blue: 0.10, alpha: 1)
        let content = NSView(); window.contentView = content
        let title = NSTextField(labelWithString: "RTP Companion"); title.font = .systemFont(ofSize: 23, weight: .semibold)
        status.font = .systemFont(ofSize: 13); status.maximumNumberOfLines = 3
        coords.font = .monospacedSystemFont(ofSize: 20, weight: .medium)
        coords.isSelectable = true
        start.target = self; start.action = #selector(toggle); start.bezelStyle = .rounded; start.controlSize = .large
        start.keyEquivalent = "\r"
        settings.target = self; settings.action = #selector(openSettings); settings.bezelStyle = .rounded; settings.isHidden = true
        windows.target = self; windows.action = #selector(changeWindow); windows.isHidden = true
        dimension.addItems(withTitles: ["Overworld","Nether","End"]); dimension.target = self; dimension.action = #selector(changeDimension)
        let world = button("World", #selector(worldView)), follow = button("Follow me", #selector(followMe)), smaller = button("-", #selector(zoomOut)), bigger = button("+", #selector(zoomIn))
        let toolbar = NSStackView(views: [world, follow, smaller, bigger, dimension]); toolbar.spacing = 8; toolbar.orientation = .horizontal
        info.font = .systemFont(ofSize: 11); info.textColor = .secondaryLabelColor; info.maximumNumberOfLines = 2
        preview.font = .systemFont(ofSize: 11); preview.textColor = .secondaryLabelColor; preview.maximumNumberOfLines = 2
        let hint = NSTextField(wrappingLabelWithString: "White ring: you. Dots: your large jumps. Scroll to zoom, drag to move. Switch dimension after portals.")
        hint.font = .systemFont(ofSize: 11); hint.textColor = .secondaryLabelColor
        regionStatus.font = .systemFont(ofSize:13,weight:.semibold)
        let stack = NSStackView(views: [title,status,start,settings,windows,coords,regionStatus,toolbar,map,hint,info,preview]); stack.orientation = .vertical; stack.alignment = .leading; stack.spacing = 12
        stack.translatesAutoresizingMaskIntoConstraints = false; content.addSubview(stack)
        for view in [status, coords, map, hint, info, preview] { view.translatesAutoresizingMaskIntoConstraints = false; view.widthAnchor.constraint(equalTo: stack.widthAnchor).isActive = true }
        map.setContentHuggingPriority(.defaultLow, for: .vertical); map.setContentCompressionResistancePriority(.defaultLow, for: .vertical)
        map.heightAnchor.constraint(greaterThanOrEqualToConstant: 250).isActive = true
        NSLayoutConstraint.activate([stack.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 20),stack.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -20),stack.topAnchor.constraint(equalTo: content.topAnchor, constant: 20),stack.bottomAnchor.constraint(equalTo: content.bottomAnchor, constant: -16)])
        window.center(); window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true)
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in Task { @MainActor in await self?.tick() } }
        Task { await loadMap() }
        Task { await loadRegions() }
    }
    func button(_ title: String,_ action: Selector) -> NSButton { let b = NSButton(title: title, target: self, action: action); b.bezelStyle = .rounded; return b }
    @objc func about() {
        let alert = NSAlert(); alert.messageText = "RTP Companion"; alert.informativeText = "A local screen reader for Minecraft Java.\n\nShow F3 (Fn + F3 on some Macs). The app automatically reads XYZ or Block coordinates from the Minecraft window. No browser or Terminal is needed.\n\nMap data: donut.auction/rtp-heatmap. Colors show recorded RTP counts, not safety. The public map requires internet access. Coordinates and captured pixels stay on this Mac and are not saved. Screen Recording permission is required; Accessibility permission is not.\n\nNo tool can promise zero ban risk. Follow DonutSMP's rules."; alert.runModal()
    }
    @objc func toggle() {
        if running { stop(); return }
        // Ask the capture API directly. A cached preflight result can stay false
        // after the user has already enabled the Settings toggle.
        awaitingPermission = false; start.title = "Finding Minecraft..."; start.isEnabled = false
        Task {
            do {
                let content = try await SCShareableContent.excludingDesktopWindows(true, onScreenWindowsOnly: true)
                targets = content.windows.filter { w in
                    let name = (w.owningApplication?.applicationName ?? "").lowercased(), title = (w.title ?? "").lowercased()
                    return w.frame.width > 300 && w.frame.height > 200 && (title.contains("minecraft") || name == "java" || name == "minecraft") && !title.contains("launcher")
                }.sorted { ($0.title ?? "").count > ($1.title ?? "").count }
                guard let first = targets.first else { status.stringValue = "Minecraft isn't open yet. Open your Java game window, show F3, then click Start tracking."; start.title = "Start tracking"; start.isEnabled = true; return }
                target = first; windows.removeAllItems(); windows.addItems(withTitles: targets.map { $0.title ?? $0.owningApplication?.applicationName ?? "Minecraft" }); windows.isHidden = targets.count < 2
                settings.isHidden = true; running = true; epoch += 1; pending = nil; lastRead = .distantPast
                start.title = "Stop tracking"; start.isEnabled = true
                status.stringValue = "Looking for your F3 coordinates in Minecraft. Keep the XYZ or Block line visible."
                await tick()
            } catch { status.stringValue = "Screen access isn't ready. If RTP Companion is already allowed, quit and reopen it, then try Start tracking again."; settings.isHidden = false; start.title = "Try tracking again"; start.isEnabled = true }
        }
    }
    @objc func openSettings() { NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture")!) }
    func applicationDidBecomeActive(_ notification: Notification) {
        if !running && start.isEnabled && CGPreflightScreenCaptureAccess() { settings.isHidden = true; start.title = "Start tracking" }
    }
    func stop() { running = false; epoch += 1; pending = nil; map.fresh = false; map.needsDisplay = true; start.title = "Start tracking"; status.stringValue = "Stopped. Click Start tracking when you're ready." }
    @objc func changeWindow() { target = targets[windows.indexOfSelectedItem]; clearPosition() }
    @objc func changeDimension() { map.dimension = dimension.indexOfSelectedItem; clearPosition() }
    func clearPosition() { epoch += 1; pending = nil; map.position = nil; map.landings = []; lastRead = .distantPast; coords.stringValue = "X: ---    Y: ---    Z: ---"; updateRegion(); map.needsDisplay = true }
    func updateRegion() {
        guard map.dimension == 0 else { regionStatus.stringValue = "\(dimension.titleOfSelectedItem ?? "Dimension"): no region map"; return }
        guard let p = map.position else { regionStatus.stringValue = "Region: waiting for coordinates"; return }
        guard let regions = map.regions else { regionStatus.stringValue = "Region map unavailable"; return }
        let key = regions.region(at:p)
        regionStatus.stringValue = "Region: \(key.flatMap { RegionMap.names[$0] } ?? "Unassigned / outside map")"
        regionStatus.textColor = key.flatMap { map.regionColors[$0] } ?? .secondaryLabelColor
    }
    @objc func worldView() { map.center = CGPoint(x: 0.5,y: 0.5); map.zoom = 1; map.follow = false; map.needsDisplay = true }
    @objc func followMe() { map.follow = true; map.followPosition(); map.needsDisplay = true }
    @objc func zoomIn() { map.zoom = min(128,map.zoom*2); map.needsDisplay = true }
    @objc func zoomOut() { map.zoom = max(1,map.zoom/2); map.needsDisplay = true }
    func tick() async {
        guard running, !busy, let target else { return }
        busy = true; defer { busy = false }
        let token = epoch
        do {
            let filter = SCContentFilter(desktopIndependentWindow: target)
            let config = SCStreamConfiguration(); config.width = Int(target.frame.width*2); config.height = Int(target.frame.height*2)
            config.showsCursor = false; config.capturesAudio = false; config.ignoreShadowsSingleWindow = true
            let image = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: config)
            let result = try await Task.detached(priority: .userInitiated) { try Reader.recognize(image) }.value
            guard running, token == epoch else { return }
            let now = Date()
            guard let (p, line) = result else {
                pending = nil; map.fresh = now.timeIntervalSince(lastRead) < 4; map.needsDisplay = true
                status.stringValue = "Show Minecraft's F3 coordinates (Fn + F3 on some Macs). I can't see the XYZ or Block line yet."
                return
            }
            preview.stringValue = "Reading: \(line)"
            guard let previous = pending, previous.distance(p) < 80, abs(previous.y-p.y) < 60, now.timeIntervalSince(pendingTime) < 5 else { pending = p; pendingTime = now; status.stringValue = "Found your coordinates. Confirming the position..."; return }
            pending = p; pendingTime = now
            if map.position == nil || map.position!.distance(p) > 1000 { map.landings.append(p); if map.landings.count > 100 { map.landings.removeFirst() } }
            map.position = p; map.fresh = true; lastRead = now
            coords.stringValue = "X: \(Int(floor(p.x)))    Y: \(Int(floor(p.y)))    Z: \(Int(floor(p.z)))"
            updateRegion()
            status.stringValue = "Tracking live. Keep F3 visible. Use /rtp normally; your marker updates automatically."
            if map.follow { map.followPosition() }; map.needsDisplay = true
        } catch {
            guard running, token == epoch else { return }
            map.fresh = false; map.needsDisplay = true
            status.stringValue = "Can't read the Minecraft window. Keep it open, then click Stop tracking and Start tracking to reconnect."
        }
    }
    func loadRegions() async {
        do {
            var request = URLRequest(url:URL(string:"https://api.donut.auction/v1/regions?dimension=overworld")!); request.timeoutInterval = 25
            let (data,response) = try await URLSession.shared.data(for:request)
            guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw URLError(.badServerResponse) }
            let regions = try JSONDecoder().decode(RegionMap.self,from:data)
            guard regions.grid.cellSize > 0, (1...1000).contains(regions.grid.width), (1...1000).contains(regions.grid.height) else { throw URLError(.cannotDecodeContentData) }
            map.regions = regions; map.regionLabels = regions.labelCells(); map.needsDisplay = true; updateRegion()
        } catch { regionStatus.stringValue = "Region boundaries unavailable. Reopen the app to retry." }
    }
    func loadMap() async {
        do {
            var request = URLRequest(url: URL(string: "https://api.donut.auction/v1/rtp/heatmap?dimension=overworld")!); request.timeoutInterval = 30
            let (data,response) = try await URLSession.shared.data(for: request)
            guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw URLError(.badServerResponse) }
            let result = try await Task.detached { () -> (Heatmap, CGImage?) in let h = try JSONDecoder().decode(Heatmap.self, from: data); return (h,h.image()) }.value
            guard let image = result.1 else { throw URLError(.cannotDecodeContentData) }
            map.heat = image; map.grid = result.0.grid; map.needsDisplay = true
            info.stringValue = "Donut Auction: \(result.0.totalRtps.formatted()) recorded RTPs. Brighter = more landings. Dark areas do not guarantee safety. Overworld only."
        } catch { info.stringValue = "The public heatmap couldn't load. Your coordinates still work on the grid. Reopen the app to retry the map." }
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
    func applicationWillTerminate(_ notification: Notification) { running = false; timer?.invalidate() }
}

@main struct Main {
    static func main() {
        let app = NSApplication.shared
        if CommandLine.arguments.contains("--self-test") { selfTest(); return }
        if let i = CommandLine.arguments.firstIndex(of: "--read-image"), CommandLine.arguments.count > i+1 {
            let url = URL(fileURLWithPath: CommandLine.arguments[i+1])
            guard let source = CGImageSourceCreateWithURL(url as CFURL, nil), let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else { fatalError("Can't read test image") }
            do { print(String(describing: try Reader.recognize(image))) } catch { print(error) }
            return
        }
        app.setActivationPolicy(.regular)
        let controller = Controller(); app.delegate = controller; app.run()
    }
    static func selfTest() {
        precondition(Reader.parse("XYZ: -12345.250 / 64.000 / 98765.125") == Position(x: -12345.25,y: 64,z: 98765.125))
        precondition(Reader.parse("Block: -12345 64 -98765 [1 0 2]") == Position(x: -12345,y: 64,z: -98765))
        precondition(Reader.parse("Chunk: 3 4 5") == nil)
        precondition(Reader.parse("XYZ: 12 9999 45") == nil)
        let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 1400, pixelsHigh: 800, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
        NSGraphicsContext.saveGraphicsState(); NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
        NSColor(calibratedRed: 0.1,green: 0.2,blue: 0.1,alpha: 1).setFill(); CGRect(x: 0,y: 0,width: 1400,height: 800).fill()
        let attr: [NSAttributedString.Key:Any] = [.font:NSFont.monospacedSystemFont(ofSize: 28, weight: .medium),.foregroundColor:NSColor.white,.backgroundColor:NSColor.black]
        ("XYZ: -85000.250 / 70.000 / 42000.125" as NSString).draw(at: NSPoint(x: 20,y: 680),withAttributes: attr)
        ("Chunk: 2 4 8" as NSString).draw(at: NSPoint(x: 20,y: 640),withAttributes: attr)
        NSGraphicsContext.restoreGraphicsState()
        do { let result = try Reader.recognize(bitmap.cgImage!); precondition(result?.0 == Position(x: -85000.25,y: 70,z: 42000.125), "Native OCR failed: \(String(describing: result))") }
        catch { fatalError("Native OCR failed: \(error)") }
        print("PASS: signed Java coordinates, debug-line filtering, range checks and real Apple Vision OCR.")
    }
}
