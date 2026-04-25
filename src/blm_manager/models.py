from dataclasses import dataclass, field
from typing import Dict, List, Optional


DEFAULT_BEAUDIO_PARAMS = {
    'm': '0',
    't': '0',
    'i': '0',
    's': '0',
    'f': '0',
    'r': '0',
    'd': '0',
    'o': '0',
    'n': '1',
    'x': '  ',
    'g': '0',
}


@dataclass
class BLMLine:
    """Representa uma linha individual de um arquivo .blm, .blmn ou .bil."""
    resource: str
    params: Dict[str, str] = field(default_factory=dict)
    mix: str = "3000"
    raw_line: str = ""

    def get_int(self, key: str, default: int = 0) -> int:
        try:
            val = self.params.get(key, str(default))
            return int(val)
        except (ValueError, TypeError):
            return default

    def to_dict(self) -> Dict:
        return {"resource": self.resource, "mix": str(self.mix)}

    @classmethod
    def from_dict(cls, data: Dict) -> 'BLMLine':
        return cls(
            resource=data.get("resource", ""),
            params=data.get("params", {}) or {},
            mix=str(data.get("mix", (data.get("params", {}) or {}).get("m", "3000")))
        )

    def __repr__(self):
        return f"<BLMLine resource='{self.resource}' params={len(self.params)}>"


@dataclass
class BLMFile:
    """Representa um arquivo .blm completo no formato legado da BeAudio."""
    header: str = ""
    lines: List[BLMLine] = field(default_factory=list)

    def to_structured(self) -> 'StructuredBLM':
        structured = StructuredBLM(header=self.header)
        current_block = None

        for line in self.lines:
            if line.resource and line.resource[0].isdigit() and ':' in line.resource and len(line.resource) <= 5:
                current_block = BLMBlock(time=line.resource, marker_line=line)
                structured.blocks.append(current_block)
            else:
                if current_block is not None:
                    current_block.items.append(line)
                else:
                    structured.orphan_lines.append(line)
        return structured


@dataclass
class BLMBlock:
    """Representa um bloco de horario do modelo interno."""
    time: str
    marker_line: Optional[BLMLine] = None
    items: List[BLMLine] = field(default_factory=list)
    vibe_min: int = 0
    vibe_max: int = 100

    def to_dict(self) -> Dict:
        return {
            "time": self.time,
            "vibe_min": self.vibe_min,
            "vibe_max": self.vibe_max,
            "items": [item.to_dict() for item in self.items],
        }

    @classmethod
    def from_dict(cls, data: Dict) -> 'BLMBlock':
        return cls(
            time=data.get("time", "00:00"),
            vibe_min=int(data.get("vibe_min", 0)),
            vibe_max=int(data.get("vibe_max", 100)),
            items=[BLMLine.from_dict(item) for item in data.get("items", [])],
        )


@dataclass
class StructuredBLM:
    """Estrutura usada pelo gerenciador de modelos e pelo gerador."""
    header: str = ""
    blocks: List[BLMBlock] = field(default_factory=list)
    orphan_lines: List[BLMLine] = field(default_factory=list)

    def to_dict(self) -> Dict:
        return {
            "version": 1,
            "format": "BLMN",
            "header": self.header,
            "blocks": [block.to_dict() for block in self.blocks],
            "orphan_lines": [line.to_dict() for line in self.orphan_lines],
        }

    @classmethod
    def from_dict(cls, data: Dict) -> 'StructuredBLM':
        return cls(
            header=data.get("header", ""),
            blocks=[BLMBlock.from_dict(block) for block in data.get("blocks", [])],
            orphan_lines=[BLMLine.from_dict(line) for line in data.get("orphan_lines", [])],
        )

    def to_flat(self) -> BLMFile:
        blm_file = BLMFile(header=self.header)
        blm_file.lines.extend(self.orphan_lines)
        for block in self.blocks:
            marker_line = block.marker_line or BLMLine(resource=block.time, params=DEFAULT_BEAUDIO_PARAMS.copy())
            blm_file.lines.append(marker_line)
            blm_file.lines.extend(block.items)
        return blm_file
