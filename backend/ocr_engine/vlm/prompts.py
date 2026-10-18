"""Prompt for the Zimbabwe National ID extraction."""

PROMPT = """You are reading a Zimbabwe National Registration card. Look at the image and extract the fields below.

Return ONLY a JSON object with exactly these keys. If a field is not visible or you are not confident, use null for that key. Do not add commentary.

{
  "id_number": "The registration number including district code if present, e.g. '63-2316316 S 50 CIT F'",
  "surname": "The holder's surname (uppercase)",
  "first_name": "The holder's first name(s), space separated",
  "dob": "Date of birth as DD/MM/YYYY",
  "village_of_origin": "Village of origin",
  "place_of_birth": "Place of birth",
  "date_of_issue": "Date of issue as DD/MM/YYYY"
}

Respond with the JSON object and nothing else."""