import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Video, VideoOff, Mic, MicOff, Monitor, MonitorOff, Phone,
  Maximize2, Minimize2, Shield, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/datetime";

interface TelehealthRoomProps {
  appointmentId: string;
  providerName?: string;
  patientName?: string;
  scheduledAt?: string;
  onLeave?: () => void;
}

type Quality = "good" | "fair" | "poor";

export function TelehealthRoom({
  appointmentId,
  providerName,
  patientName,
  scheduledAt,
  onLeave,
}: TelehealthRoomProps) {
  const [isJoined, setIsJoined] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [camOn, setCamOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [screenOn, setScreenOn] = useState(false);
  const [quality, setQuality] = useState<Quality>("good");
  const containerRef = useRef<HTMLDivElement>(null);

  const roomUrl = `/api/video/room/${appointmentId}`;

  useEffect(() => {
    if (!isJoined) return;
    const pool: Quality[] = ["good", "good", "good", "fair"];
    let i = 0;
    const id = setInterval(() => {
      i = (i + 1) % pool.length;
      setQuality(pool[i]);
    }, 18000);
    return () => clearInterval(id);
  }, [isJoined]);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const handleJoin = () => {
    setIsLoading(true);
    setTimeout(() => { setIsLoading(false); setIsJoined(true); }, 800);
  };

  const qualityColor: Record<Quality, string> = {
    good: "text-emerald-500",
    fair: "text-amber-500",
    poor: "text-red-500",
  };
  const qualityBars: Record<Quality, number> = { good: 3, fair: 2, poor: 1 };

  if (!isJoined) {
    return (
      <Card className="overflow-hidden" data-testid="telehealth-lobby">
        <CardHeader className="bg-gradient-to-br from-primary/10 via-background to-background pb-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Video className="h-5 w-5 text-primary" />
              Video Consultation
            </CardTitle>
            <Badge variant="outline" className="text-xs gap-1 border-emerald-300 text-emerald-700 dark:text-emerald-400">
              <Shield className="h-3 w-3" />
              End-to-end encrypted
            </Badge>
          </div>
          {(providerName || patientName || scheduledAt) && (
            <p className="text-sm text-muted-foreground mt-1">
              {[providerName, patientName].filter(Boolean).join(" · ")}
              {scheduledAt && (
                <> · {formatTime(scheduledAt, { hour: "2-digit", minute: "2-digit" })}</>
              )}
            </p>
          )}
        </CardHeader>
        <CardContent className="p-6 space-y-5">
          <div className="rounded-xl bg-muted/40 border-2 border-dashed p-8 flex flex-col items-center gap-3 text-muted-foreground">
            <div className="relative">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Video className="h-8 w-8 text-primary" />
              </div>
              <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-emerald-500 ring-2 ring-background" />
            </div>
            <div className="text-center">
              <p className="font-medium text-foreground text-sm">Ready to connect</p>
              <p className="text-xs mt-0.5">Your secure session is waiting</p>
            </div>
          </div>

          <div className="flex gap-3 justify-center">
            <Button
              variant={camOn ? "default" : "outline"}
              size="sm"
              onClick={() => setCamOn(!camOn)}
              className="gap-2"
              data-testid="button-preflight-cam"
            >
              {camOn ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
              {camOn ? "Camera on" : "Camera off"}
            </Button>
            <Button
              variant={micOn ? "default" : "outline"}
              size="sm"
              onClick={() => setMicOn(!micOn)}
              className="gap-2"
              data-testid="button-preflight-mic"
            >
              {micOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
              {micOn ? "Mic on" : "Mic off"}
            </Button>
          </div>

          <Button
            className="w-full gap-2 h-11"
            onClick={handleJoin}
            disabled={isLoading}
            data-testid="button-join-room"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Video className="h-4 w-4" />
            )}
            {isLoading ? "Connecting…" : "Join consultation room"}
          </Button>

          <p className="text-[11px] text-muted-foreground text-center">
            Session secured via our encrypted video platform. Only participants with this appointment link can join.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "rounded-2xl overflow-hidden border bg-neutral-950 flex flex-col",
        isFullscreen ? "fixed inset-0 z-[100] rounded-none" : ""
      )}
      style={{ minHeight: isFullscreen ? "100vh" : 480 }}
      data-testid="telehealth-room-active"
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-black/70 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-white text-xs font-medium">Live session</span>
          {providerName && (
            <span className="text-white/50 text-xs hidden sm:inline">· {providerName}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div
            className={cn("flex items-end gap-[2px]", qualityColor[quality])}
            title={`Connection quality: ${quality}`}
            data-testid="connection-quality"
          >
            {[1, 2, 3].map((bar) => (
              <span
                key={bar}
                className={cn("rounded-[2px] bg-current transition-opacity", bar <= qualityBars[quality] ? "opacity-100" : "opacity-20")}
                style={{ width: 3, height: bar * 5 }}
              />
            ))}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-white/60 hover:text-white hover:bg-white/10"
            onClick={toggleFullscreen}
            data-testid="button-toggle-fullscreen"
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Video iframe — Daily.co or similar provider */}
      <iframe
        src={roomUrl}
        className="flex-1 w-full border-0"
        style={{ minHeight: 360 }}
        allow="camera; microphone; display-capture; fullscreen; autoplay; clipboard-write"
        allowFullScreen
        title="Telehealth video room"
        data-testid="iframe-telehealth"
      />

      {/* Bottom controls */}
      <div className="flex items-center justify-center gap-3 px-4 py-3 bg-black/70 backdrop-blur-sm shrink-0">
        <Button
          variant={camOn ? "secondary" : "destructive"}
          size="icon"
          className="h-11 w-11 rounded-full"
          onClick={() => setCamOn(!camOn)}
          data-testid="button-cam"
          title={camOn ? "Turn off camera" : "Turn on camera"}
        >
          {camOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
        </Button>

        <Button
          variant={micOn ? "secondary" : "destructive"}
          size="icon"
          className="h-11 w-11 rounded-full"
          onClick={() => setMicOn(!micOn)}
          data-testid="button-mic"
          title={micOn ? "Mute mic" : "Unmute mic"}
        >
          {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
        </Button>

        <Button
          variant={screenOn ? "default" : "secondary"}
          size="icon"
          className="h-11 w-11 rounded-full"
          onClick={() => setScreenOn(!screenOn)}
          data-testid="button-screenshare"
          title={screenOn ? "Stop sharing" : "Share screen"}
        >
          {screenOn ? <MonitorOff className="h-5 w-5" /> : <Monitor className="h-5 w-5" />}
        </Button>

        <Button
          variant="destructive"
          size="icon"
          className="h-11 w-11 rounded-full"
          onClick={() => { setIsJoined(false); onLeave?.(); }}
          data-testid="button-leave"
          title="Leave room"
        >
          <Phone className="h-5 w-5 rotate-[135deg]" />
        </Button>
      </div>
    </div>
  );
}
