from app.rag.search import KnowledgeIndex, charge_type, tokenize

index = KnowledgeIndex.load()


def top(label: str, question: str) -> list[str]:
    return [h.passage["id"] for h in index.search(label, question)]


def test_the_tapped_charge_ranks_first_for_every_line_on_the_2026_bill():
    printed = {
        "Generation": "generation", "Transmission": "transmission", "System Loss": "system_loss",
        "Distribution (Meralco)": "distribution", "Senior Citizen": "senior_citizen", "Government Taxes": "taxes",
        "Universal Charges": "universal", "FiT-All (Renewable)": "fit_all", "GEA-All (Renewable)": "gea_all",
        "GEA-AII (Renewable)": "gea_all", "Lifeline": "lifeline",
    }
    for label, passage in printed.items():
        assert top(label, "What is this?")[0] == passage, label


def test_general_and_tagalog_questions():
    assert "pass_through" in top("Generation", "Does Meralco keep all of this?")
    assert "why_bill_changes" in top("Some new line", "Bakit tumaas ang bill ko?")
    assert "meter_readings" in top("Some new line", "Where can I see my meter readings?")


def test_no_match_returns_nothing():
    assert index.search("Zzz", "qwerty") == []


def test_every_passage_is_public_meralco_text():
    assert len(index.passages) == 16
    for p in index.passages:
        assert p["source"].startswith("https://www.meralco.com.ph/")


def test_helpers():
    assert charge_type("GEA-All (Renewable)") == "gea_all"
    assert charge_type("Government Taxes") == "local_tax"
    assert {"why", "higher"} <= set(tokenize("Bakit tumaas?"))
