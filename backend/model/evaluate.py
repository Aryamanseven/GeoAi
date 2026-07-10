from dotenv import load_dotenv
load_dotenv()
import os
os.environ["GEOAI_ENABLE_CLIP"] = "1"

import random
import json
from io import BytesIO
from pathlib import Path
from torchvision.datasets import Country211
from backend.model.clip_classifier import get_classifier
from backend.services.country_data import country_catalog

def run_eval():
    classifier = get_classifier()
    
    # find correct dataset root
    # try these paths in order until one works:
    roots = [
        "data/country211/country211",
        "data/country211",
        "../data/country211/country211",
        "../data/country211"
    ]
    dataset = None
    for root in roots:
        try:
            dataset = Country211(root, split="test", download=False)
            print(f"Dataset loaded from {root}, {len(dataset)} samples")
            break
        except:
            continue
    
    if dataset is None:
        print("ERROR: Could not find dataset")
        return
    
    # load metadata for continent and name lookup
    catalog = country_catalog()
    iso2_to_name = {}
    for record in catalog:
        iso2 = record.iso2  
        name = record.name
        iso2_to_name[iso2.upper()] = name
        
    iso2_to_continent = {r.iso2.upper(): r.continent for r in catalog}
    
    # random sample across full dataset
    random.seed(42)
    total = len(dataset)
    sample_size = min(100, total)
    indices = random.sample(range(total), sample_size)
    
    correct1 = 0
    correct3 = 0
    continent_stats = {}
    
    for idx, i in enumerate(indices):
        img, label = dataset[i]
        true_iso2 = dataset.classes[label].upper()
        true_country = iso2_to_name.get(true_iso2, true_iso2)
        
        # convert PIL image to bytes
        buf = BytesIO()
        img.save(buf, format="JPEG")
        img_bytes = buf.getvalue()
        
        # predict using CLIP classifier only
        try:
            results = classifier.predict(img_bytes)
            predicted_names = [r["country"] for r in results[:3]]
        except Exception as e:
            print(f"Prediction failed for sample {idx}: {e}")
            continue
        
        # check accuracy
        if predicted_names[0] == true_country:
            correct1 += 1
        if true_country in predicted_names:
            correct3 += 1
        
        # per continent tracking
        continent = iso2_to_continent.get(true_iso2, "Unknown")
        if continent not in continent_stats:
            continent_stats[continent] = {"correct1": 0, "correct3": 0, "total": 0}
        continent_stats[continent]["total"] += 1
        if predicted_names[0] == true_country:
            continent_stats[continent]["correct1"] += 1
        if true_country in predicted_names:
            continent_stats[continent]["correct3"] += 1
        
        if idx % 10 == 0:
            print(f"Progress: {idx}/{sample_size}")
    
    # calculate results
    top1 = round(correct1 / sample_size * 100, 1)
    top3 = round(correct3 / sample_size * 100, 1)
    
    per_continent = {}
    for cont, stats in continent_stats.items():
        if stats["total"] > 0:
            per_continent[cont] = {
                "top1": round(stats["correct1"] / stats["total"] * 100, 1),
                "top3": round(stats["correct3"] / stats["total"] * 100, 1),
                "samples": stats["total"]
            }
    
    results = {
        "top1": top1,
        "top3": top3,
        "samples": sample_size,
        "method": "CLIP ViT-B/32 + LoRA + MLP Head",
        "baseline_comparison": {
            "clip_zeroshot_published": 31.0,
            "our_model": top1
        },
        "per_continent": per_continent
    }
    
    # save results
    output_path = Path("data/eval_results.json")
    output_path.parent.mkdir(exist_ok=True)
    output_path.write_text(json.dumps(results, indent=2))
    
    # print results
    print(f"\n=== GeoAI Evaluation Results ===")
    print(f"Method: {results['method']}")
    print(f"Samples: {sample_size} (random, seed=42)")
    print(f"Top-1 Accuracy: {top1}%")
    print(f"Top-3 Accuracy: {top3}%")
    print(f"vs CLIP zero-shot baseline: 31.0%")
    print(f"\nPer-continent breakdown:")
    for cont, stats in per_continent.items():
        print(f"  {cont}: Top-1 {stats['top1']}%  Top-3 {stats['top3']}%  ({stats['samples']} samples)")
    print(f"\nSaved to data/eval_results.json")

if __name__ == "__main__":
    run_eval()