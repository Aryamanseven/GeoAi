import os
os.environ["GEOAI_ENABLE_CLIP"] = "1"
from backend.model.clip_classifier import get_classifier
from torchvision.datasets import Country211
from io import BytesIO

c = get_classifier()
dataset = Country211("data/country211", split="test", download=False)

for i in range(3):
    img, label = dataset[i]
    true_code = dataset.classes[label]
    buf = BytesIO()
    img.save(buf, format="JPEG")
    result = c.predict(buf.getvalue())
    print("True:", true_code)
    print("Predicted:", [r["country"] for r in result[:3]])
    print()
