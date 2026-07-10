import os
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader
from torchvision.datasets import Country211
from torchvision import transforms
import open_clip
import numpy as np
from pathlib import Path
import joblib

from peft import LoraConfig, get_peft_model
from torch.optim.lr_scheduler import OneCycleLR

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
MODEL_DIR = Path(__file__).parent / "saved"
MODEL_DIR.mkdir(exist_ok=True)

DATASET_ROOT = "data/country211"
BATCH_SIZE = 32
EPOCHS = 30
LR = 1e-3
WEIGHT_DECAY = 0.05

def build_model_and_transforms():
    model, _, preprocess = open_clip.create_model_and_transforms(
        "ViT-L-14", pretrained="openai"
    )
    model = model.to(DEVICE)
    return model, preprocess

def apply_lora_to_clip(clip_model):
    # freeze everything first
    for param in clip_model.parameters():
        param.requires_grad = False

    lora_config = LoraConfig(
        r=16,
        lora_alpha=32,
        target_modules=["attn.in_proj", "attn.out_proj"],
        lora_dropout=0.1,
        bias="none"
    )
    
    # Apply LoRA to the visual encoder
    clip_model.visual = get_peft_model(clip_model.visual, lora_config)
    return clip_model

class GeoClassifier(nn.Module):
    def __init__(self, clip_model, num_classes):
        super().__init__()
        self.clip_visual = clip_model.visual
        embed_dim = getattr(clip_model.visual, 'output_dim', 768)
        
        self.classifier = nn.Sequential(
            nn.Linear(embed_dim, 512),
            nn.BatchNorm1d(512),
            nn.GELU(),
            nn.Dropout(0.3),
            nn.Linear(512, num_classes)
        )
    
    def forward(self, x):
        with torch.cuda.amp.autocast():
            features = self.clip_visual(x)
            if isinstance(features, tuple):
                features = features[0]
            features = features.float()
        return self.classifier(features)

def mixup_data(x, y, alpha=0.2):
    lam = np.random.beta(alpha, alpha)
    idx = torch.randperm(x.size(0)).to(x.device)
    mixed_x = lam * x + (1 - lam) * x[idx]
    y_a, y_b = y, y[idx]
    return mixed_x, y_a, y_b, lam

def mixup_criterion(criterion, pred, y_a, y_b, lam):
    return lam * criterion(pred, y_a) + (1 - lam) * criterion(pred, y_b)

def train():
    print(f"Using device: {DEVICE}")
    print(f"GPU: {torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'None'}")
    
    clip_model, preprocess = build_model_and_transforms()
    
    # data augmentation for training
    train_transform = transforms.Compose([
        transforms.RandomHorizontalFlip(),
        transforms.RandAugment(num_ops=2, magnitude=9),
        preprocess,
    ])
    
    print("Loading datasets...")
    train_dataset = Country211(DATASET_ROOT, split="train", 
                               transform=train_transform, download=False)
    val_dataset = Country211(DATASET_ROOT, split="valid", 
                             transform=preprocess, download=False)
    
    num_classes = len(train_dataset.classes)
    print(f"Classes: {num_classes}, Train: {len(train_dataset)}, Val: {len(val_dataset)}")
    
    train_loader = DataLoader(train_dataset, batch_size=BATCH_SIZE, 
                              shuffle=True, num_workers=4, pin_memory=True)
    val_loader = DataLoader(val_dataset, batch_size=BATCH_SIZE, 
                            shuffle=False, num_workers=4, pin_memory=True)
    
    clip_model = apply_lora_to_clip(clip_model)
    model = GeoClassifier(clip_model, num_classes).to(DEVICE)
    
    # count trainable params
    trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
    total = sum(p.numel() for p in model.parameters())
    print(f"Trainable params: {trainable:,} / {total:,}")
    
    criterion = nn.CrossEntropyLoss(label_smoothing=0.1)
    
    optimizer = optim.AdamW(
        [p for p in model.parameters() if p.requires_grad],
        lr=LR,
        weight_decay=WEIGHT_DECAY
    )
    
    scheduler = OneCycleLR(
        optimizer,
        max_lr=LR,
        epochs=EPOCHS,
        steps_per_epoch=len(train_loader),
        pct_start=0.1
    )
    
    scaler = torch.cuda.amp.GradScaler()
    
    best_val_acc = 0.0
    
    for epoch in range(EPOCHS):
        # training
        model.train()
        train_loss = 0.0
        train_correct = 0
        train_total = 0
        
        for batch_idx, (images, labels) in enumerate(train_loader):
            images, labels = images.to(DEVICE), labels.to(DEVICE)
            
            # Mixup
            mixed_images, labels_a, labels_b, lam = mixup_data(images, labels)
            
            optimizer.zero_grad()
            with torch.cuda.amp.autocast():
                outputs = model(mixed_images)
                loss = mixup_criterion(criterion, outputs, labels_a, labels_b, lam)
            
            scaler.scale(loss).backward()
            scaler.unscale_(optimizer)
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            scaler.step(optimizer)
            scaler.update()
            
            scheduler.step()
            
            train_loss += loss.item()
            _, predicted = outputs.max(1)
            train_total += labels.size(0)
            
            # for mixup, we just approximate train accuracy on the dominant class
            dominant_labels = labels_a if lam > 0.5 else labels_b
            train_correct += predicted.eq(dominant_labels).sum().item()
            
            if batch_idx % 50 == 0:
                print(f"Epoch {epoch+1}/{EPOCHS} "
                      f"Batch {batch_idx}/{len(train_loader)} "
                      f"Loss: {loss.item():.4f} "
                      f"Acc: {100.*train_correct/train_total:.1f}%")
        
        # validation
        model.eval()
        val_correct = val_correct3 = val_total = 0
        
        with torch.no_grad():
            for images, labels in val_loader:
                images, labels = images.to(DEVICE), labels.to(DEVICE)
                with torch.cuda.amp.autocast():
                    outputs = model(images)
                _, predicted = outputs.max(1)
                top3 = outputs.topk(3, dim=1).indices
                
                val_total += labels.size(0)
                val_correct += predicted.eq(labels).sum().item()
                val_correct3 += sum(
                    labels[i].item() in top3[i].tolist() 
                    for i in range(labels.size(0))
                )
        
        val_top1 = 100. * val_correct / val_total
        val_top3 = 100. * val_correct3 / val_total
        
        print(f"\nEpoch {epoch+1} Summary:")
        print(f"Train Acc: {100.*train_correct/train_total:.1f}% (mixup dominant)")
        print(f"Val Top-1: {val_top1:.1f}%  Top-3: {val_top3:.1f}%\n")
        
        # save best model
        if val_top1 > best_val_acc:
            best_val_acc = val_top1
            
            # extract visual lora state carefully depending on how peft wrapped it
            if hasattr(model.clip_visual, 'state_dict'):
                visual_state = model.clip_visual.state_dict()
            else:
                visual_state = {}

            torch.save({
                "epoch": epoch,
                "model_state_dict": model.state_dict(),
                "visual_lora_state": visual_state,
                "val_top1": val_top1,
                "val_top3": val_top3,
                "classes": train_dataset.classes,
                "num_classes": num_classes,
                "model_arch": "ViT-L-14"
            }, MODEL_DIR / "clip_finetuned.pt")
            print(f"Saved best model: {val_top1:.1f}%")
    
    # also save class labels for inference
    np.save(MODEL_DIR / "country_labels.npy", 
            np.array(train_dataset.classes))
    
    print(f"\nTraining complete. Best Val Top-1: {best_val_acc:.1f}%")
    print(f"Model saved to {MODEL_DIR / 'clip_finetuned.pt'}")

if __name__ == "__main__":
    train()
