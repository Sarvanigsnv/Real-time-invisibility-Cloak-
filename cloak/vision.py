
import base64
import os
import time

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")

import cv2
import mediapipe as mp
import numpy as np


class InvisibilityVision:
    def __init__(self):
        self.mp_hands = mp.solutions.hands

        self.hands = self.mp_hands.Hands(
            static_image_mode=False,
            max_num_hands=1,
            min_detection_confidence=0.8,
            min_tracking_confidence=0.8,
        )

        self.segmenter = mp.solutions.selfie_segmentation.SelfieSegmentation(
            model_selection=1
        )

        self.background = None
        self.reference_gesture = None
        self.reference_handedness = None
        self.cloak_active = False

        self.last_toggle = 0.0
        self.closed = False
        
    @staticmethod
    def decode_frame(data_url):
        if "," in data_url:
            data_url = data_url.split(",", 1)[1]

        raw = base64.b64decode(data_url)
        array = np.frombuffer(raw, dtype=np.uint8)
        frame = cv2.imdecode(array, cv2.IMREAD_COLOR)

        if frame is None:
            raise ValueError("Could not decode webcam frame.")

        return frame

    @staticmethod
    def encode_frame(frame):
        success, encoded = cv2.imencode(
            ".jpg",
            frame,
            [int(cv2.IMWRITE_JPEG_QUALITY), 75],
        )

        if not success:
            raise ValueError("Could not encode processed frame.")

        return base64.b64encode(encoded.tobytes()).decode("ascii")

    @staticmethod
    def gesture_features(hand_landmarks):
        points = hand_landmarks.landmark
        wrist = points[0]

        index_mcp = points[5]
        pinky_mcp = points[17]

        scale = 1.0 / (
            abs(index_mcp.x - pinky_mcp.x)
            + abs(index_mcp.y - pinky_mcp.y)
            + 1e-6
        )

        features = []

        for index in (4, 8, 12, 16, 20):
            dx = (points[index].x - wrist.x) * scale
            dy = (points[index].y - wrist.y) * scale

            features.extend([
                float(np.hypot(dx, dy)),
                float(np.arctan2(dy, dx)),
            ])

        return np.asarray(features, dtype=np.float32)

    @staticmethod
    def gestures_match(current, reference, threshold=0.15):
        if current is None or reference is None:
            return False

        denominator = (
            np.linalg.norm(current) * np.linalg.norm(reference)
        )

        if denominator < 1e-8:
            return False

        similarity = float(
            np.dot(current, reference) / denominator
        )

        length_diff = float(
            np.mean(np.abs(current[::2] - reference[::2]))
        )

        angle_diff = float(
            np.mean(
                np.abs(
                    np.sin(current[1::2] - reference[1::2])
                )
            )
        )

        return (
            similarity > (1 - threshold)
            and length_diff < 0.1
            and angle_diff < 0.15
        )

    @staticmethod
    def enhance_mask(mask):
        kernel = cv2.getStructuringElement(
            cv2.MORPH_ELLIPSE,
            (25, 25),
        )

        mask = cv2.morphologyEx(
            mask, cv2.MORPH_CLOSE, kernel
        )

        mask = cv2.morphologyEx(
            mask, cv2.MORPH_OPEN, kernel
        )

        return cv2.medianBlur(mask, 5)

    @staticmethod
    def detect_hair(frame, mask):
        lab = cv2.cvtColor(frame, cv2.COLOR_RGB2LAB)

        lower = np.array([0, 120, 110])
        upper = np.array([255, 145, 165])

        hair_mask = cv2.inRange(lab, lower, upper)

        return cv2.bitwise_or(mask, hair_mask)

    @staticmethod
    def pyramid_blending(foreground, background, mask):
        mask = mask.astype(np.float32) / 255.0

        pyramid_depth = 4

        g_foreground = [foreground.astype(np.float32)]
        g_background = [background.astype(np.float32)]

        g_mask = [
            cv2.resize(
                mask,
                foreground.shape[:2][::-1],
            )
        ]

        for _ in range(pyramid_depth):
            g_foreground.append(
                cv2.pyrDown(g_foreground[-1])
            )

            g_background.append(
                cv2.pyrDown(g_background[-1])
            )

            g_mask.append(
                cv2.pyrDown(g_mask[-1])
            )

        blended = g_background[-1]

        for i in range(pyramid_depth - 1, -1, -1):
            blended = cv2.pyrUp(blended)

            height, width = g_foreground[i].shape[:2]

            blended = cv2.resize(
                blended,
                (width, height),
            )

            blended = (
                g_background[i] * g_mask[i][..., None]
                + g_foreground[i] * (
                    1 - g_mask[i][..., None]
                )
            )

        return np.clip(blended, 0, 255).astype(np.uint8)

    def process(self, data_url, command=None):
        frame = self.decode_frame(data_url)

        # Mirror the camera frame, matching the original implementation.
        frame = cv2.flip(frame, 1)

        rgb = cv2.cvtColor(
            frame,
            cv2.COLOR_BGR2RGB,
        )

        hand_results = self.hands.process(rgb)

        hand = None
        handedness = None

        if hand_results.multi_hand_landmarks:
            hand = hand_results.multi_hand_landmarks[0]

            if hand_results.multi_handedness:
                handedness = (
                    hand_results.multi_handedness[0]
                    .classification[0].label
                )

        status_message = None

        # Capture the empty background.
        if command == "capture_background":
            self.background = rgb.copy()

            status_message = (
                "Background captured successfully."
            )

        # Register the user's chosen gesture.
        elif command == "train_gesture":
                if hand is None:
                    status_message = (
                        "No hand detected. Show your gesture and try again."
                    )
                else:
                    self.reference_gesture = self.gesture_features(hand)
                    self.reference_handedness = handedness

                    # Prevent immediate activation on the training frame.
                    self.last_toggle = time.time()

                    status_message = (
                        "Gesture registered successfully."
                    )


        # Reset the current session.
        elif command == "reset":
                self.cloak_active = False
                self.background = None
                self.reference_gesture = None
                self.reference_handedness = None
                self.last_toggle = 0.0

                status_message = (
                    "Session reset. Capture background and train your gesture."
                )


        # Automatic gesture recognition.
        if (
            command not in ("train_gesture", "reset")
            and self.reference_gesture is not None
            and hand is not None
            and handedness == self.reference_handedness
            and time.time() - self.last_toggle > 1.5
        ):
            current = self.gesture_features(hand)

            if self.gestures_match(
                current,
                self.reference_gesture,
            ):
                self.cloak_active = not self.cloak_active
                self.last_toggle = time.time()

                status_message = (
                    "Gesture detected: cloak "
                    + ("ON" if self.cloak_active else "OFF")
                )

        output_rgb = rgb.copy()

        # Original invisibility rendering pipeline.
        if self.cloak_active and self.background is not None:
            height, width = rgb.shape[:2]

            segmentation = self.segmenter.process(rgb)

            mask = (
                segmentation.segmentation_mask > 0.85
            ).astype(np.uint8) * 255

            mask = self.enhance_mask(mask)

            mask = self.detect_hair(rgb, mask)

            edges = cv2.Canny(mask, 50, 150)

            mask = cv2.inpaint(
                mask,
                edges,
                3,
                cv2.INPAINT_TELEA,
            )

            background = cv2.resize(
                self.background,
                (width, height),
            )

            output_rgb = self.pyramid_blending(
                rgb,
                background,
                mask,
            )

        elif self.cloak_active and self.background is None:
            status_message = (
                "Capture a background before activating the cloak."
            )

        # Convert back to BGR for OpenCV text and JPEG encoding.
        output_bgr = cv2.cvtColor(
            output_rgb,
            cv2.COLOR_RGB2BGR,
        )

        cv2.putText(
            output_bgr,
            "INVISIBILITY: "
            + ("ON" if self.cloak_active else "OFF"),
            (20, 40),
            cv2.FONT_HERSHEY_SIMPLEX,
            1,
            (0, 255, 0) if self.cloak_active else (0, 0, 255),
            2,
        )

        encoded_frame = self.encode_frame(output_bgr)

        return encoded_frame, {
            "cloak_active": self.cloak_active,
            "background_ready": self.background is not None,
            "gesture_ready": self.reference_gesture is not None,
            "message": status_message,
        }

    def close(self):
        if not self.closed:
            self.hands.close()
            self.segmenter.close()
            self.closed = True
