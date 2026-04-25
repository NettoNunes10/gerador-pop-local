import json
from typing import Dict

from .models import BLMFile, BLMLine, StructuredBLM
from .parser import BLMParser


class BLMService:
    @staticmethod
    def load(path: str) -> BLMFile:
        if path.lower().endswith(".blmn"):
            return BLMService.load_structured(path).to_flat()
        return BLMParser.load(path)

    @staticmethod
    def save(blm_file: BLMFile, path: str):
        if path.lower().endswith(".blmn"):
            BLMService.save_structured(blm_file.to_structured(), path)
            return
        BLMParser.save(blm_file, path)

    @staticmethod
    def load_structured(path: str) -> StructuredBLM:
        if path.lower().endswith(".blmn"):
            with open(path, 'r', encoding='utf-8') as f:
                return StructuredBLM.from_dict(json.load(f))
        return BLMParser.load(path).to_structured()

    @staticmethod
    def save_structured(model: StructuredBLM, path: str):
        if path.lower().endswith(".blmn"):
            with open(path, 'w', encoding='utf-8') as f:
                json.dump(model.to_dict(), f, indent=2, ensure_ascii=False)
            return
        BLMParser.save(model.to_flat(), path)

    @staticmethod
    def from_payload(data: Dict) -> StructuredBLM:
        if "blocks" in data:
            return StructuredBLM.from_dict({
                "header": data.get("header", ""),
                "blocks": data.get("blocks", []),
                "orphan_lines": data.get("orphan_lines", []),
            })

        blm = BLMFile(header=data.get("header", ""))
        for line_data in data.get("lines", []):
            blm.lines.append(BLMLine(
                resource=line_data.get("resource", ""),
                params=line_data.get("params", {}),
                mix=str(line_data.get("mix", line_data.get("params", {}).get("m", "3000"))),
            ))
        return blm.to_structured()

    @staticmethod
    def get_stats(model) -> Dict:
        lines = model.lines if isinstance(model, BLMFile) else model.to_flat().lines
        stats = {
            "total_lines": len(lines),
            "music_slots": 0,
            "sweeper_slots": 0,
            "commercial_blocks": 0,
            "fixed_files": 0,
            "markers": 0,
        }

        for line in lines:
            origin = line.get_int('o')
            res = line.resource.lower()

            if origin == 2 or res.endswith(".apm"):
                if 'vht' in res or 'vinheta' in res or 'vignette' in res:
                    stats["sweeper_slots"] += 1
                else:
                    stats["music_slots"] += 1
            elif origin == 5 or "reserva" in res:
                stats["commercial_blocks"] += 1
            elif ":" in line.resource and len(line.resource) <= 5:
                stats["markers"] += 1
            elif "." in line.resource:
                stats["fixed_files"] += 1

        return stats
