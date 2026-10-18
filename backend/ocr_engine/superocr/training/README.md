# Training the detector

**Annotation rules**
- `card`: tight box around the whole card in the RAW photo. Include some tilted/glare/cluttered-background shots.
- Field classes: box the VALUE only (e.g. `63-2316316 S 50`), never the printed label. Annotate on DEWARPED cards.
- `photo`: the holder portrait. Used only to detect upside-down cards.
- Get consent for every image, and keep the dataset encrypted at rest.

**Train**
    pip install ultralytics
    yolo detect train model=yolov8n.pt data=training/data.yaml imgsz=960 epochs=100 batch=16
    export SUPEROCR_YOLO_WEIGHTS=/path/to/best.pt

Start with ~150-300 annotated cards, use heavy augmentation, hold out 20% for validation.

**Licence:** Ultralytics YOLO is AGPL-3.0. For a commercial KYC product either get their enterprise licence or
a permissively licensed detector (YOLOX / RT-DETR are Apache-2.0). `Detector` is a two-line Protocol; swap freely.
