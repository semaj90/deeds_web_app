#!/usr/bin/env python3
"""
Extract frames from video evidence for analysis
Supports: Legal depositions, surveillance footage, courtroom recordings
"""

import cv2
import os
import sys
import argparse
from pathlib import Path
import json

def extract_frames(
    video_path: str,
    output_dir: str,
    fps: float = 1.0,
    quality: int = 95,
    format: str = 'jpg'
):
    """
    Extract frames from video at specified FPS

    Args:
        video_path: Path to input video
        output_dir: Directory to save frames
        fps: Frames per second to extract (1.0 = 1 frame/second)
        quality: JPEG quality (1-100, higher = better quality)
        format: Output format ('jpg', 'png')

    Returns:
        dict: Metadata about extraction
    """
    if not os.path.exists(video_path):
        raise FileNotFoundError(f"Video not found: {video_path}")

    os.makedirs(output_dir, exist_ok=True)

    video = cv2.VideoCapture(video_path)
    if not video.isOpened():
        raise ValueError(f"Could not open video: {video_path}")

    # Video metadata
    video_fps = video.get(cv2.CAP_PROP_FPS)
    total_frames = int(video.get(cv2.CAP_PROP_FRAME_COUNT))
    width = int(video.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(video.get(cv2.CAP_PROP_FRAME_HEIGHT))
    duration_sec = total_frames / video_fps if video_fps > 0 else 0

    frame_interval = int(video_fps / fps) if fps > 0 else 1

    print(f"Video Info:")
    print(f"  Path: {video_path}")
    print(f"  Resolution: {width}x{height}")
    print(f"  FPS: {video_fps:.2f}")
    print(f"  Duration: {duration_sec:.2f}s ({total_frames} frames)")
    print(f"  Extract: 1 frame every {frame_interval} frames ({fps} FPS)")
    print()

    frame_count = 0
    saved_count = 0
    timestamps = []

    while True:
        ret, frame = video.read()
        if not ret:
            break

        if frame_count % frame_interval == 0:
            timestamp_ms = int(video.get(cv2.CAP_PROP_POS_MSEC))
            timestamp_sec = timestamp_ms / 1000.0

            # Save frame
            ext = 'jpg' if format == 'jpg' else 'png'
            frame_filename = f"frame_{saved_count:06d}_t{timestamp_sec:.2f}s.{ext}"
            frame_path = os.path.join(output_dir, frame_filename)

            if format == 'jpg':
                cv2.imwrite(frame_path, frame, [cv2.IMWRITE_JPEG_QUALITY, quality])
            else:
                cv2.imwrite(frame_path, frame)

            timestamps.append({
                'frame_index': saved_count,
                'timestamp_sec': timestamp_sec,
                'filename': frame_filename
            })

            saved_count += 1

            if saved_count % 100 == 0:
                print(f"  Extracted {saved_count} frames...")

        frame_count += 1

    video.release()

    # Save metadata
    metadata = {
        'video_path': video_path,
        'output_dir': output_dir,
        'video_fps': video_fps,
        'extract_fps': fps,
        'resolution': [width, height],
        'duration_sec': duration_sec,
        'total_video_frames': total_frames,
        'extracted_frames': saved_count,
        'timestamps': timestamps
    }

    metadata_path = os.path.join(output_dir, 'metadata.json')
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=2)

    print()
    print(f"✅ Extraction complete!")
    print(f"  Frames saved: {saved_count}")
    print(f"  Output dir: {output_dir}")
    print(f"  Metadata: {metadata_path}")

    return metadata

def main():
    parser = argparse.ArgumentParser(
        description='Extract frames from video for analysis'
    )
    parser.add_argument('video_path', help='Path to input video')
    parser.add_argument('-o', '--output-dir', default='./frames',
                        help='Output directory for frames (default: ./frames)')
    parser.add_argument('-f', '--fps', type=float, default=1.0,
                        help='Frames per second to extract (default: 1.0)')
    parser.add_argument('-q', '--quality', type=int, default=95,
                        help='JPEG quality 1-100 (default: 95)')
    parser.add_argument('--format', choices=['jpg', 'png'], default='jpg',
                        help='Output format (default: jpg)')

    args = parser.parse_args()

    try:
        extract_frames(
            args.video_path,
            args.output_dir,
            args.fps,
            args.quality,
            args.format
        )
    except Exception as e:
        print(f"❌ Error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
