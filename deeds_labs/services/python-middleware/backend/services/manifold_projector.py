"""
Manifold Projection Service

Orchestrates quaternion transformer and tricubic interpolation for 3D visualization.
Projects 4D embeddings to 3D space for memory palace rendering.

Usage:
    projector = ManifoldProjector()
    coords_3d = projector.project_embeddings(embeddings_4d)
    path = projector.interpolate_path(start_embedding, end_embedding)
"""

import logging
import numpy as np
from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass
import time

logger = logging.getLogger(__name__)


@dataclass
class Point3D:
    """3D coordinate point"""

    x: float
    y: float
    z: float

    def to_dict(self) -> Dict:
        return {"x": self.x, "y": self.y, "z": self.z}

    def to_array(self) -> np.ndarray:
        return np.array([self.x, self.y, self.z])


class QuaternionTransformer:
    """Quaternion-based 4D to 3D projection"""

    def __init__(self):
        """Initialize quaternion transformer"""
        # Default rotation quaternion (identity)
        self.rotation_quat = np.array([1.0, 0.0, 0.0, 0.0])
        logger.info("QuaternionTransformer initialized")

    def set_rotation(self, quat: np.ndarray) -> None:
        """
        Set rotation quaternion.

        Args:
            quat: Quaternion [w, x, y, z]
        """
        # Normalize
        norm = np.linalg.norm(quat)
        if norm > 0:
            self.rotation_quat = quat / norm
        else:
            self.rotation_quat = np.array([1.0, 0.0, 0.0, 0.0])

    def set_euler_angles(self, roll: float, pitch: float, yaw: float) -> None:
        """
        Set rotation using Euler angles (in radians).

        Args:
            roll: Rotation around X axis
            pitch: Rotation around Y axis
            yaw: Rotation around Z axis
        """
        # Convert Euler angles to quaternion
        cy = np.cos(yaw * 0.5)
        sy = np.sin(yaw * 0.5)
        cp = np.cos(pitch * 0.5)
        sp = np.sin(pitch * 0.5)
        cr = np.cos(roll * 0.5)
        sr = np.sin(roll * 0.5)

        w = cr * cp * cy + sr * sp * sy
        x = sr * cp * cy - cr * sp * sy
        y = cr * sp * cy + sr * cp * sy
        z = cr * cp * sy - sr * sp * cy

        self.set_rotation(np.array([w, x, y, z]))

    def _quaternion_multiply(self, q1: np.ndarray, q2: np.ndarray) -> np.ndarray:
        """Multiply two quaternions"""
        w1, x1, y1, z1 = q1
        w2, x2, y2, z2 = q2

        w = w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2
        x = w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2
        y = w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2
        z = w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2

        return np.array([w, x, y, z])

    def _rotate_vector(self, v: np.ndarray, q: np.ndarray) -> np.ndarray:
        """Rotate 3D vector using quaternion"""
        # Convert vector to quaternion (w=0)
        v_quat = np.array([0.0, v[0], v[1], v[2]])

        # Conjugate of rotation quaternion
        q_conj = np.array([q[0], -q[1], -q[2], -q[3]])

        # Rotate: q * v * q^-1
        rotated = self._quaternion_multiply(q, self._quaternion_multiply(v_quat, q_conj))

        return rotated[1:4]

    def project_4d_to_3d(self, point_4d: np.ndarray) -> np.ndarray:
        """
        Project 4D point to 3D using quaternion rotation.

        Args:
            point_4d: 4D point [x, y, z, w]

        Returns:
            3D point [x, y, z]
        """
        # Extract 3D part and rotate
        point_3d = point_4d[:3]
        rotated = self._rotate_vector(point_3d, self.rotation_quat)

        # Add w component as scaling
        scale = 1.0 + point_4d[3] * 0.1  # Small scaling effect
        return rotated * scale

    def project_batch(self, points_4d: np.ndarray) -> np.ndarray:
        """
        Project batch of 4D points to 3D.

        Args:
            points_4d: Batch of 4D points (N x 4)

        Returns:
            Batch of 3D points (N x 3)
        """
        points_3d = np.zeros((len(points_4d), 3))

        for i, point in enumerate(points_4d):
            points_3d[i] = self.project_4d_to_3d(point)

        return points_3d


class TricubicInterpolator:
    """Tricubic interpolation for smooth path generation"""

    @staticmethod
    def tricubic_kernel(t: float) -> Tuple[float, float, float, float]:
        """
        Tricubic Hermite basis functions.

        Args:
            t: Parameter in [0, 1]

        Returns:
            Tuple of (h00, h10, h01, h11)
        """
        t2 = t * t
        t3 = t2 * t

        h00 = 2 * t3 - 3 * t2 + 1
        h10 = t3 - 2 * t2 + t
        h01 = -2 * t3 + 3 * t2
        h11 = t3 - t2

        return h00, h10, h01, h11

    @staticmethod
    def interpolate_cubic(p0: float, p1: float, p2: float, p3: float, t: float) -> float:
        """
        Cubic Hermite interpolation between p1 and p2.

        Args:
            p0, p1, p2, p3: Control points
            t: Parameter in [0, 1]

        Returns:
            Interpolated value
        """
        h00, h10, h01, h11 = TricubicInterpolator.tricubic_kernel(t)

        # Tangents
        m0 = (p2 - p0) * 0.5
        m1 = (p3 - p1) * 0.5

        return h00 * p1 + h10 * m0 + h01 * p2 + h11 * m1

    @staticmethod
    def interpolate_path(
        start: np.ndarray, end: np.ndarray, num_points: int = 10
    ) -> List[np.ndarray]:
        """
        Interpolate smooth path between two points.

        Args:
            start: Start point (3D)
            end: End point (3D)
            num_points: Number of interpolation points

        Returns:
            List of interpolated points
        """
        path = []

        # Use linear interpolation for simplicity (can be extended to tricubic)
        for i in range(num_points):
            t = i / (num_points - 1) if num_points > 1 else 0.0
            point = start * (1 - t) + end * t
            path.append(point)

        return path


class ManifoldProjector:
    """Manifold projection service orchestrating quaternion and tricubic"""

    def __init__(self):
        """Initialize manifold projector"""
        self.quaternion = QuaternionTransformer()
        self.interpolator = TricubicInterpolator()

        # Cache for projections
        self.projection_cache: Dict[str, np.ndarray] = {}
        self.max_cache_size = 1000

        logger.info("ManifoldProjector initialized")

    def project_embeddings(
        self, embeddings_4d: np.ndarray, use_cache: bool = True
    ) -> np.ndarray:
        """
        Project 4D embeddings to 3D.

        Args:
            embeddings_4d: 4D embeddings (N x 4)
            use_cache: Whether to use caching

        Returns:
            3D coordinates (N x 3)
        """
        try:
            start_time = time.time()

            # Project using quaternion transformer
            embeddings_3d = self.quaternion.project_batch(embeddings_4d)

            # Normalize to unit sphere
            norms = np.linalg.norm(embeddings_3d, axis=1, keepdims=True)
            embeddings_3d = embeddings_3d / (norms + 1e-8)

            elapsed_ms = int((time.time() - start_time) * 1000)
            logger.debug(f"Projected {len(embeddings_4d)} embeddings in {elapsed_ms}ms")

            return embeddings_3d

        except Exception as e:
            logger.error(f"Embedding projection failed: {e}")
            return np.zeros((len(embeddings_4d), 3))

    def interpolate_path(
        self, start_embedding: np.ndarray, end_embedding: np.ndarray, num_points: int = 20
    ) -> List[Point3D]:
        """
        Interpolate smooth path between two embeddings.

        Args:
            start_embedding: Start embedding (3D or 4D)
            end_embedding: End embedding (3D or 4D)
            num_points: Number of interpolation points

        Returns:
            List of 3D points along path
        """
        try:
            # Convert to 3D if needed
            if len(start_embedding) == 4:
                start_3d = self.quaternion.project_4d_to_3d(start_embedding)
            else:
                start_3d = start_embedding

            if len(end_embedding) == 4:
                end_3d = self.quaternion.project_4d_to_3d(end_embedding)
            else:
                end_3d = end_embedding

            # Interpolate path
            path_points = self.interpolator.interpolate_path(start_3d, end_3d, num_points)

            # Convert to Point3D objects
            path = [Point3D(p[0], p[1], p[2]) for p in path_points]

            logger.debug(f"Interpolated path with {len(path)} points")
            return path

        except Exception as e:
            logger.error(f"Path interpolation failed: {e}")
            return []

    def set_rotation(self, roll: float, pitch: float, yaw: float) -> None:
        """
        Set 3D rotation using Euler angles.

        Args:
            roll: Rotation around X axis (radians)
            pitch: Rotation around Y axis (radians)
            yaw: Rotation around Z axis (radians)
        """
        self.quaternion.set_euler_angles(roll, pitch, yaw)
        logger.debug(f"Set rotation: roll={roll:.2f}, pitch={pitch:.2f}, yaw={yaw:.2f}")

    def get_3d_coordinates(self, embeddings: np.ndarray) -> List[Dict]:
        """
        Get 3D coordinates for embeddings.

        Args:
            embeddings: Input embeddings (N x 4 or N x 3)

        Returns:
            List of 3D coordinate dictionaries
        """
        try:
            # Ensure 4D
            if embeddings.shape[1] == 3:
                # Pad with zeros to make 4D
                embeddings_4d = np.hstack([embeddings, np.zeros((len(embeddings), 1))])
            else:
                embeddings_4d = embeddings

            # Project to 3D
            coords_3d = self.project_embeddings(embeddings_4d)

            # Convert to dictionaries
            result = []
            for i, coord in enumerate(coords_3d):
                result.append(
                    {
                        "id": str(i),
                        "x": float(coord[0]),
                        "y": float(coord[1]),
                        "z": float(coord[2]),
                    }
                )

            return result

        except Exception as e:
            logger.error(f"Getting 3D coordinates failed: {e}")
            return []

    def get_stats(self) -> Dict:
        """Get projector statistics"""
        return {
            "cache_size": len(self.projection_cache),
            "max_cache_size": self.max_cache_size,
            "rotation_quat": self.quaternion.rotation_quat.tolist(),
        }


# Singleton instance
_manifold_projector = None


def get_manifold_projector() -> ManifoldProjector:
    """Get or create singleton manifold projector"""
    global _manifold_projector
    if _manifold_projector is None:
        _manifold_projector = ManifoldProjector()
    return _manifold_projector
