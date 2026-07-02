"""
evals/eval_runner.py

Evaluation suite for DocIQ RAG pipeline.
Measures:
  - retrieval precision@3  (was correct chunk in top 3 results?)
  - faithfulness score avg (LLM-judged faithfulness)
  - first-token latency p50/p95

Requirements:
  - EVAL_DOC_ID env var set to a pre-ingested document
  - GROQ_API_KEY set
  - Python ML service running (or run via --offline flag for embedding-only)

Usage:
  python evals/eval_runner.py --doc-id <doc_id> [--output-json results.json]
"""

import argparse
import asyncio
import json
import os
import statistics
import sys
import time
from pathlib import Path
from typing import Optional

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.config import get_settings
from app.database import init_db_pool
from app.embedder import get_embedder
from app.faiss_store import get_faiss_store
from app.retrieval import retrieve
from app.llm import generate_answer

settings = get_settings()

# ── Eval QA pairs ─────────────────────────────────────────────
# Ground-truth QA pairs for a Wikipedia article (e.g., "Transformer (deep learning)")
# Each entry has:
#   question: str
#   expected_answer_keywords: list[str]  — keywords that must appear in answer
#   relevant_page_nums: list[int]        — pages that contain the answer (for precision@K)

EVAL_QA_PAIRS = [
    {
        "id": "q001",
        "question": "What is the main architecture introduced in the paper?",
        "expected_keywords": ["transformer", "attention", "encoder", "decoder"],
        "relevant_pages": [1, 2],
    },
    {
        "id": "q002",
        "question": "What is self-attention and how does it work?",
        "expected_keywords": ["self-attention", "query", "key", "value", "softmax"],
        "relevant_pages": [2, 3],
    },
    {
        "id": "q003",
        "question": "What problem does positional encoding solve?",
        "expected_keywords": ["position", "sequence", "order"],
        "relevant_pages": [3],
    },
    {
        "id": "q004",
        "question": "What is multi-head attention?",
        "expected_keywords": ["multi-head", "parallel", "attention heads"],
        "relevant_pages": [3, 4],
    },
    {
        "id": "q005",
        "question": "How many layers does the encoder have in the base model?",
        "expected_keywords": ["6", "layers", "encoder"],
        "relevant_pages": [4],
    },
    {
        "id": "q006",
        "question": "What optimizer was used to train the model?",
        "expected_keywords": ["Adam", "optimizer", "learning rate"],
        "relevant_pages": [5],
    },
    {
        "id": "q007",
        "question": "What is the BLEU score achieved on WMT 2014 English-German?",
        "expected_keywords": ["BLEU", "28.4", "English-German"],
        "relevant_pages": [6],
    },
    {
        "id": "q008",
        "question": "What is label smoothing and why is it used?",
        "expected_keywords": ["label smoothing", "regularization", "uncertainty"],
        "relevant_pages": [5],
    },
    {
        "id": "q009",
        "question": "How is attention computed mathematically?",
        "expected_keywords": ["dot product", "scale", "softmax", "QK", "sqrt"],
        "relevant_pages": [2, 3],
    },
    {
        "id": "q010",
        "question": "What are the two sub-layers in each encoder layer?",
        "expected_keywords": ["feed-forward", "self-attention"],
        "relevant_pages": [2],
    },
    {
        "id": "q011",
        "question": "What is the model dimension used in the base Transformer?",
        "expected_keywords": ["512", "d_model"],
        "relevant_pages": [4],
    },
    {
        "id": "q012",
        "question": "How does the decoder differ from the encoder?",
        "expected_keywords": ["masked", "cross-attention", "encoder-decoder"],
        "relevant_pages": [2, 3],
    },
    {
        "id": "q013",
        "question": "What is beam search and how is it used during inference?",
        "expected_keywords": ["beam search", "decoding", "beam size"],
        "relevant_pages": [6],
    },
    {
        "id": "q014",
        "question": "What hardware was used to train the models?",
        "expected_keywords": ["GPU", "P100", "NVIDIA"],
        "relevant_pages": [5],
    },
    {
        "id": "q015",
        "question": "What is the purpose of residual connections?",
        "expected_keywords": ["residual", "skip connection", "gradient"],
        "relevant_pages": [2, 3],
    },
    {
        "id": "q016",
        "question": "What task was used to evaluate English constituency parsing?",
        "expected_keywords": ["parsing", "constituency", "Penn Treebank"],
        "relevant_pages": [7],
    },
    {
        "id": "q017",
        "question": "What does the feed-forward network in each layer do?",
        "expected_keywords": ["feed-forward", "linear", "ReLU", "projection"],
        "relevant_pages": [3],
    },
    {
        "id": "q018",
        "question": "How is the attention mask applied in the decoder?",
        "expected_keywords": ["masked", "prevent", "future", "positions"],
        "relevant_pages": [3],
    },
    {
        "id": "q019",
        "question": "What is the dropout rate used in the base model?",
        "expected_keywords": ["dropout", "0.1"],
        "relevant_pages": [5],
    },
    {
        "id": "q020",
        "question": "What were previous state-of-the-art models based on?",
        "expected_keywords": ["recurrent", "RNN", "LSTM", "convolutional"],
        "relevant_pages": [1],
    },
    {
        "id": "q021",
        "question": "What is the key advantage of self-attention over recurrence?",
        "expected_keywords": ["parallelization", "sequential", "path length", "long-range"],
        "relevant_pages": [1, 7],
    },
    {
        "id": "q022",
        "question": "How many attention heads are used in the base model?",
        "expected_keywords": ["8", "heads"],
        "relevant_pages": [4],
    },
    {
        "id": "q023",
        "question": "What is the inner-layer dimensionality of the feed-forward network?",
        "expected_keywords": ["2048", "FFN", "inner"],
        "relevant_pages": [4],
    },
    {
        "id": "q024",
        "question": "How were the training data sets for machine translation prepared?",
        "expected_keywords": ["byte-pair encoding", "BPE", "tokenization", "shared vocabulary"],
        "relevant_pages": [5],
    },
    {
        "id": "q025",
        "question": "What is the warmup schedule for the learning rate?",
        "expected_keywords": ["warmup", "steps", "4000", "learning rate"],
        "relevant_pages": [5],
    },
    {
        "id": "q026",
        "question": "What is the Transformer's computational complexity per layer?",
        "expected_keywords": ["complexity", "O(n²d)", "sequence length"],
        "relevant_pages": [7],
    },
    {
        "id": "q027",
        "question": "What is the BLEU score on English-French translation?",
        "expected_keywords": ["41", "BLEU", "English-French"],
        "relevant_pages": [6],
    },
    {
        "id": "q028",
        "question": "How is the output of the model converted to probabilities?",
        "expected_keywords": ["softmax", "linear", "vocabulary", "probability"],
        "relevant_pages": [3, 4],
    },
    {
        "id": "q029",
        "question": "What is layer normalization and where is it applied?",
        "expected_keywords": ["layer norm", "normalization", "sub-layer"],
        "relevant_pages": [2, 3],
    },
    {
        "id": "q030",
        "question": "What is the 'big' Transformer model's parameter count approximately?",
        "expected_keywords": ["213", "million", "parameters"],
        "relevant_pages": [6],
    },
    {
        "id": "q031",
        "question": "What training cost advantages does the Transformer offer?",
        "expected_keywords": ["training cost", "FLOPs", "less", "FLOPS"],
        "relevant_pages": [6],
    },
    {
        "id": "q032",
        "question": "How does the model handle variable-length sequences?",
        "expected_keywords": ["padding", "masking", "batching"],
        "relevant_pages": [3],
    },
    {
        "id": "q033",
        "question": "What is the role of the encoder in machine translation?",
        "expected_keywords": ["encode", "source", "representation", "input"],
        "relevant_pages": [1, 2],
    },
    {
        "id": "q034",
        "question": "What ablation studies were performed?",
        "expected_keywords": ["ablation", "components", "variations"],
        "relevant_pages": [7],
    },
    {
        "id": "q035",
        "question": "How do attention weights allow interpretability?",
        "expected_keywords": ["visualize", "attend", "interpretable", "weights"],
        "relevant_pages": [7, 8],
    },
    {
        "id": "q036",
        "question": "What is the purpose of the output linear and softmax layers?",
        "expected_keywords": ["project", "vocabulary", "probability distribution"],
        "relevant_pages": [4],
    },
    {
        "id": "q037",
        "question": "What is encoder-decoder attention?",
        "expected_keywords": ["encoder output", "decoder queries", "cross-attention"],
        "relevant_pages": [3],
    },
    {
        "id": "q038",
        "question": "What are the learned positional encodings an alternative to?",
        "expected_keywords": ["sinusoidal", "fixed", "learned"],
        "relevant_pages": [4],
    },
    {
        "id": "q039",
        "question": "What dataset was used for English-German translation?",
        "expected_keywords": ["WMT 2014", "English-German"],
        "relevant_pages": [5],
    },
    {
        "id": "q040",
        "question": "What is the significance of scaled dot-product attention?",
        "expected_keywords": ["scale", "1/sqrt(dk)", "prevent", "vanishing gradients"],
        "relevant_pages": [2, 3],
    },
    {
        "id": "q041",
        "question": "What is the total training time for the base model?",
        "expected_keywords": ["hours", "training", "steps", "100,000"],
        "relevant_pages": [5],
    },
    {
        "id": "q042",
        "question": "How does the Transformer handle long-range dependencies?",
        "expected_keywords": ["constant", "path length", "attention", "direct"],
        "relevant_pages": [1, 7],
    },
    {
        "id": "q043",
        "question": "What regularization techniques are used?",
        "expected_keywords": ["dropout", "label smoothing"],
        "relevant_pages": [5],
    },
    {
        "id": "q044",
        "question": "What is the vocabulary size for English-German?",
        "expected_keywords": ["37000", "vocabulary", "shared"],
        "relevant_pages": [5],
    },
    {
        "id": "q045",
        "question": "How does the Transformer compare to ConvS2S?",
        "expected_keywords": ["outperforms", "BLEU", "ConvS2S"],
        "relevant_pages": [6],
    },
    {
        "id": "q046",
        "question": "What is the purpose of padding masks?",
        "expected_keywords": ["padding", "mask", "ignore", "zero"],
        "relevant_pages": [3],
    },
    {
        "id": "q047",
        "question": "What is the model trained to maximize?",
        "expected_keywords": ["log probability", "likelihood", "maximize", "target"],
        "relevant_pages": [5],
    },
    {
        "id": "q048",
        "question": "What are the three types of attention in the Transformer?",
        "expected_keywords": ["encoder self-attention", "decoder self-attention", "encoder-decoder attention"],
        "relevant_pages": [2, 3],
    },
    {
        "id": "q049",
        "question": "What future work is suggested by the authors?",
        "expected_keywords": ["future", "extend", "images", "audio", "video"],
        "relevant_pages": [8],
    },
    {
        "id": "q050",
        "question": "What are the limitations of the recurrent approach mentioned?",
        "expected_keywords": ["sequential", "parallel", "memory", "bottleneck"],
        "relevant_pages": [1],
    },
]


# ── Eval functions ────────────────────────────────────────────

def precision_at_k(retrieved_pages: list[int], relevant_pages: list[int], k: int = 3) -> float:
    """Check if any of the relevant pages appear in the top-k retrieved pages."""
    top_k_pages = retrieved_pages[:k]
    hits = sum(1 for p in top_k_pages if p in relevant_pages)
    return 1.0 if hits > 0 else 0.0  # binary: did we find any relevant chunk?


async def run_single_eval(
    doc_id: str,
    qa: dict,
    results: list[dict],
) -> None:
    t0 = time.time()
    question = qa["question"]
    try:
        chunks, sub_queries = await retrieve(doc_id, question)
        retrieved_pages = [c["page_num"] for c in chunks]
        p_at_3 = precision_at_k(retrieved_pages, qa["relevant_pages"], k=3)

        answer, faithfulness_score, explanation = await generate_answer(question, chunks)
        latency_ms = int((time.time() - t0) * 1000)

        # Keyword check
        answer_lower = answer.lower()
        keyword_hits = sum(1 for kw in qa["expected_keywords"] if kw.lower() in answer_lower)
        keyword_recall = keyword_hits / max(len(qa["expected_keywords"]), 1)

        result = {
            "id": qa["id"],
            "question": question,
            "p_at_3": p_at_3,
            "faithfulness_score": faithfulness_score,
            "keyword_recall": keyword_recall,
            "latency_ms": latency_ms,
            "retrieved_pages": retrieved_pages[:3],
            "relevant_pages": qa["relevant_pages"],
            "answer_snippet": answer[:200],
            "status": "ok",
        }
        results.append(result)
        print(f"  [{qa['id']}] P@3={p_at_3:.1f} faith={faithfulness_score:.2f} latency={latency_ms}ms")

    except Exception as e:
        print(f"  [{qa['id']}] ERROR: {e}")
        results.append({
            "id": qa["id"],
            "question": question,
            "p_at_3": 0.0,
            "faithfulness_score": 0.0,
            "keyword_recall": 0.0,
            "latency_ms": int((time.time() - t0) * 1000),
            "status": "error",
            "error": str(e),
        })


async def run_eval(doc_id: str, output_path: Optional[str] = None) -> dict:
    print(f"\n{'='*60}")
    print(f"DocIQ Eval Suite — doc_id={doc_id}")
    print(f"Running {len(EVAL_QA_PAIRS)} questions…")
    print(f"{'='*60}\n")

    results: list[dict] = []

    # Run sequentially to avoid rate limits (use asyncio.gather for speed)
    for qa in EVAL_QA_PAIRS:
        await run_single_eval(doc_id, qa, results)
        await asyncio.sleep(0.5)  # rate limit buffer

    # ── Aggregate metrics ─────────────────────────────────────
    ok_results = [r for r in results if r["status"] == "ok"]
    latencies = [r["latency_ms"] for r in ok_results]
    latencies.sort()

    p50 = statistics.median(latencies) if latencies else 0
    p95 = latencies[int(len(latencies) * 0.95)] if latencies else 0
    avg_p_at_3 = statistics.mean(r["p_at_3"] for r in ok_results) if ok_results else 0
    avg_faithfulness = statistics.mean(r["faithfulness_score"] for r in ok_results) if ok_results else 0
    avg_keyword_recall = statistics.mean(r["keyword_recall"] for r in ok_results) if ok_results else 0

    summary = {
        "doc_id": doc_id,
        "total_questions": len(EVAL_QA_PAIRS),
        "successful": len(ok_results),
        "failed": len(results) - len(ok_results),
        "metrics": {
            "precision_at_3": round(avg_p_at_3, 4),
            "avg_faithfulness": round(avg_faithfulness, 4),
            "avg_keyword_recall": round(avg_keyword_recall, 4),
            "latency_p50_ms": round(p50),
            "latency_p95_ms": round(p95),
        },
        "assertions": {
            "precision_at_3_gt_0.7": avg_p_at_3 > 0.7,
            "faithfulness_gt_0.8": avg_faithfulness > 0.8,
        },
        "results": results,
    }

    all_pass = all(summary["assertions"].values())

    print(f"\n{'='*60}")
    print("RESULTS")
    print(f"{'='*60}")
    print(f"  Precision@3:     {avg_p_at_3:.3f}  {'✓' if avg_p_at_3 > 0.7 else '✗'} (target > 0.70)")
    print(f"  Faithfulness:    {avg_faithfulness:.3f}  {'✓' if avg_faithfulness > 0.8 else '✗'} (target > 0.80)")
    print(f"  Keyword recall:  {avg_keyword_recall:.3f}")
    print(f"  Latency P50:     {round(p50)}ms")
    print(f"  Latency P95:     {round(p95)}ms")
    print(f"  {'ALL ASSERTIONS PASSED ✓' if all_pass else 'SOME ASSERTIONS FAILED ✗'}")
    print(f"{'='*60}\n")

    if output_path:
        Path(output_path).write_text(json.dumps(summary, indent=2))
        print(f"Results written to {output_path}")

    return summary


# ── CLI ───────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="DocIQ Eval Runner")
    parser.add_argument("--doc-id", required=True, help="Pre-ingested document ID to evaluate against")
    parser.add_argument("--output-json", help="Write full results to this JSON file")
    parser.add_argument("--fail-on-regression", help="JSON file with baseline metrics — fail if regression > 5%")
    args = parser.parse_args()

    # Init DB pool
    init_db_pool()

    summary = asyncio.run(run_eval(args.doc_id, args.output_json))

    # Regression check
    if args.fail_on_regression and Path(args.fail_on_regression).exists():
        baseline = json.loads(Path(args.fail_on_regression).read_text())
        base_faith = baseline["metrics"]["avg_faithfulness"]
        curr_faith = summary["metrics"]["avg_faithfulness"]
        regression = base_faith - curr_faith
        if regression > 0.05:
            print(f"REGRESSION DETECTED: faithfulness dropped {regression:.3f} (baseline={base_faith:.3f}, current={curr_faith:.3f})")
            sys.exit(2)
        print(f"No regression: faithfulness {base_faith:.3f} → {curr_faith:.3f} (delta={-regression:+.3f})")

    all_pass = all(summary["assertions"].values())
    sys.exit(0 if all_pass else 1)


if __name__ == "__main__":
    main()
