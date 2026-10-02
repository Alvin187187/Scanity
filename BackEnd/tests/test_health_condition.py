"""
Unit/Integration tests for app/services/health_condition_service.py
"""
import pytest
import uuid
from unittest.mock import MagicMock
from app.models.schema import NutritionRule
from app.services.health_condition_service import check_health_conditions

USER_ID = uuid.UUID("b2222222-2222-2222-2222-222222222222")

def test_diabetes_high_sugar_warning():
    mock_db = MagicMock()
    condition_id = uuid.uuid4()
    
    mock_result_1 = MagicMock()
    mock_result_1.scalars.return_value.all.return_value = [condition_id]
    
    # Restrict mock attributes strictly to NutritionRule schema properties
    mock_rule = MagicMock(spec=NutritionRule)
    mock_rule.nutrient = "sugars_g"
    mock_rule.limit_value = 10.0
    mock_rule.description = "High sugar warning for diabetes"
    
    mock_result_2 = MagicMock()
    mock_result_2.scalars.return_value.all.return_value = [mock_rule]
    
    mock_db.execute.side_effect = [mock_result_1, mock_result_2]

    nutrients = {"sugars_g": 25.0, "sodium_mg": 100.0}
    result = check_health_conditions(mock_db, USER_ID, nutrients)
    
    assert result["has_violation"] is True
    assert len(result["violations"]) == 1
    assert "High sugar warning for diabetes" in result["violations"]

