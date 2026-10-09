[Skip to content](https://pydantic.dev/docs/validation/latest/get-started/#_top)

# Pydantic Validation

[![CI](https://img.shields.io/github/actions/workflow/status/pydantic/pydantic/ci.yml?branch=main&logo=github&label=CI)](https://github.com/pydantic/pydantic/actions?query=event%3Apush+branch%3Amain+workflow%3ACI)[![Coverage](https://coverage-badge.samuelcolvin.workers.dev/pydantic/pydantic.svg)](https://coverage-badge.samuelcolvin.workers.dev/redirect/pydantic/pydantic)

[![pypi](https://img.shields.io/pypi/v/pydantic.svg)](https://pypi.python.org/pypi/pydantic)[![CondaForge](https://img.shields.io/conda/v/conda-forge/pydantic.svg)](https://anaconda.org/conda-forge/pydantic)[![downloads](https://static.pepy.tech/badge/pydantic/month)](https://pepy.tech/project/pydantic)

[![license](https://img.shields.io/github/license/pydantic/pydantic.svg)](https://github.com/pydantic/pydantic/blob/main/LICENSE)[![llms.txt](https://img.shields.io/badge/llms.txt-green)](https://pydantic.dev/docs/validation/latest/llms.txt)

Documentation for version: v2.14.0.

Pydantic is the most widely used data validation library for Python.

Fast and extensible, Pydantic plays nicely with your linters/IDE/brain. Define how data should be in pure, canonical Python 3.10+; validate it with Pydantic.

**Sign up for our newsletter, _The Pydantic Stack_, with updates & tutorials on Pydantic, Logfire, and Pydantic AI:**

Subscribe

## Why use Pydantic?

[Section titled Why use Pydantic?](https://pydantic.dev/docs/validation/latest/get-started/#why-use-pydantic)

- **Powered by type hints** — with Pydantic, schema validation and serialization are controlled by type annotations; less to learn, less code to write, and integration with your IDE and static analysis tools. [Learn more…](https://pydantic.dev/docs/validation/latest/get-started/why/#type-hints)
- **Speed** — Pydantic’s core validation logic is written in Rust. As a result, Pydantic is among the fastest data validation libraries for Python. [Learn more…](https://pydantic.dev/docs/validation/latest/get-started/why/#performance)
- **JSON Schema** — Pydantic models can emit JSON Schema, allowing for easy integration with other tools. [Learn more…](https://pydantic.dev/docs/validation/latest/get-started/why/#json-schema)
- **Strict** and **Lax** mode — Pydantic can run in either strict mode (where data is not converted) or lax mode where Pydantic tries to coerce data to the correct type where appropriate. [Learn more…](https://pydantic.dev/docs/validation/latest/get-started/why/#strict-lax)
- **Dataclasses**, **TypedDicts** and more — Pydantic supports validation of many standard library types including `dataclass` and `TypedDict`. [Learn more…](https://pydantic.dev/docs/validation/latest/get-started/why/#dataclasses-typeddict-more)
- **Customisation** — Pydantic allows custom validators and serializers to alter how data is processed in many powerful ways. [Learn more…](https://pydantic.dev/docs/validation/latest/get-started/why/#customisation)
- **Ecosystem** — around 8,000 packages on PyPI use Pydantic, including massively popular libraries like
_FastAPI_, _huggingface_, _Django Ninja_, _SQLModel_, & _LangChain_. [Learn more…](https://pydantic.dev/docs/validation/latest/get-started/why/#ecosystem)
- **Battle tested** — Pydantic is downloaded over 550M times/month and is used by all FAANG companies and 20 of the 25 largest companies on NASDAQ. If you’re trying to do something with Pydantic, someone else has probably already done it. [Learn more…](https://pydantic.dev/docs/validation/latest/get-started/why/#using-pydantic)

[Installing Pydantic](https://pydantic.dev/docs/validation/latest/get-started/install/) is as simple as: `pip install pydantic`

## Pydantic examples

[Section titled Pydantic examples](https://pydantic.dev/docs/validation/latest/get-started/#pydantic-examples)

To see Pydantic at work, let’s start with a simple example, creating a custom class that inherits from `BaseModel`:

Validation Successful

```python
from datetime import datetimefrom pydantic import BaseModel, PositiveIntclass User(BaseModel):    id: int      name: str = 'John Doe'      signup_ts: datetime | None      tastes: dict[str, PositiveInt]  external_data = {    'id': 123,    'signup_ts': '2019-06-01 12:22',      'tastes': {        'wine': 9,        b'cheese': 7,          'cabbage': '1',      },}user = User(**external_data)  print(user.id)  #> 123print(user.model_dump())  """{    'id': 123,    'name': 'John Doe',    'signup_ts': datetime.datetime(2019, 6, 1, 12, 22),    'tastes': {'wine': 9, 'cheese': 7, 'cabbage': 1},}"""




```

`id` is of type `int`; the annotation-only declaration tells Pydantic that this field is required. Strings,
bytes, or floats will be coerced to integers if possible; otherwise an exception will be raised.

`name` is a string; because it has a default, it is not required.

`signup_ts` is a [`datetime`](https://docs.python.org/3/library/datetime.html#datetime.datetime) field that is required, but the value `None` may be provided;
Pydantic will process either a [Unix timestamp](https://en.wikipedia.org/wiki/Unix_time) integer (e.g. `1496498400`)
or a string representing the date and time.

`tastes` is a dictionary with string keys and positive integer values. The `PositiveInt` type is
shorthand for `Annotated[int, annotated_types.Gt(0)]`.

The input here is an [ISO 8601](https://en.wikipedia.org/wiki/ISO_8601) formatted datetime, but Pydantic will
convert it to a [`datetime`](https://docs.python.org/3/library/datetime.html#datetime.datetime) object.

The key here is `bytes`, but Pydantic will take care of coercing it to a string.

Similarly, Pydantic will coerce the string `'1'` to the integer `1`.

We create instance of `User` by passing our external data to `User` as keyword arguments.

We can access fields as attributes of the model.

We can convert the model to a dictionary with [`model_dump()`](https://pydantic.dev/docs/validation/latest/api/pydantic/base_model/#pydantic.BaseModel.model_dump).

If validation fails, Pydantic will raise an error with a breakdown of what was wrong:

Validation Error

```python
# continuing the above example...from datetime import datetimefrom pydantic import BaseModel, PositiveInt, ValidationErrorclass User(BaseModel):    id: int    name: str = 'John Doe'    signup_ts: datetime | None    tastes: dict[str, PositiveInt]external_data = {'id': 'not an int', 'tastes': {}}  try:    User(**external_data)  except ValidationError as e:    print(e.errors())    """    [        {            'type': 'int_parsing',            'loc': ('id',),            'msg': 'Input should be a valid integer, unable to parse string as an integer',            'input': 'not an int',            'url': 'https://errors.pydantic.dev/2/v/int_parsing',        },        {            'type': 'missing',            'loc': ('signup_ts',),            'msg': 'Field required',            'input': {'id': 'not an int', 'tastes': {}},            'url': 'https://errors.pydantic.dev/2/v/missing',        },    ]    """




```

The input data is wrong here — `id` is not a valid integer, and `signup_ts` is missing.

Trying to instantiate `User` will raise a [`ValidationError`](https://pydantic.dev/docs/validation/latest/api/pydantic-core/pydantic_core/#pydantic_core.ValidationError) with a list of errors.

## Who is using Pydantic?

[Section titled Who is using Pydantic?](https://pydantic.dev/docs/validation/latest/get-started/#who-is-using-pydantic)

Hundreds of organisations and packages are using Pydantic. Some of the prominent companies and organizations around the world who are using Pydantic include:

[![Adobe](https://pydantic.dev/docs/validation/logos/adobe_logo.png)](https://pydantic.dev/docs/validation/latest/get-started/why/#org-adobe "Adobe")

[![Amazon and AWS](https://pydantic.dev/docs/validation/logos/amazon_logo.png)](https://pydantic.dev/docs/validation/latest/get-started/why/#org-amazon "Amazon and AWS")

[![Anthropic](https://pydantic.dev/docs/validation/logos/anthropic_logo.png)](https://pydantic.dev/docs/validation/latest/get-started/why/#org-anthropic "Anthropic")

[![Apple](https://pydantic.dev/docs/validation/logos/apple_logo.png)](https://pydantic.dev/docs/validation/latest/get-started/why/#org-apple "Apple")

[![ASML](https://pydantic.dev/docs/validation/logos/asml_logo.png)](https://pydantic.dev/docs/validation/latest/get-started/why/#org-asml "ASML")

[![AstraZeneca](https://pydantic.dev/docs/validation/logos/astrazeneca_logo.png)](https://pydantic.dev/docs/validation/latest/get-started/why/#org-astrazeneca "AstraZeneca")

[![Cisco Systems](https://pydantic.dev/docs/validation/logos/cisco_logo.png)](https://pydantic.dev/docs/validation/latest/get-started/why/#org-cisco "Cisco Systems")

[![Capital One](https://pydantic.dev/docs/validation/logos/capital_one_logo.png)](https://pydantic.dev/docs/validation/latest/get-started/why/#org-capital_one "Capital One")

[![Comcast](https://pydantic.dev/docs/validation/logos/comcast_logo.png)](https://pydantic.dev/docs/validation/latest/get-started/why/#org-comcast "Comcast")

[![Datadog](https://pydantic.dev/docs/validation/logos/datadog_logo.png)](https://pydantic.dev/docs/validation/latest/get-started/why/#org-datadog "Datadog")

[![Facebook](https://pydantic.dev/docs/validation/logos/facebook_logo.png)](https://pydantic.dev/docs/validation/latest/get-started/why/#org-facebook "Facebook")

[![GitHub](https://pydantic.dev/docs/validation/logos/github_logo.png)](https://pydantic.dev/docs/validation/latest/get-started/why/#org-github "GitHub")

[![Google](https://pydantic.dev/docs/validation/logos/google_logo.png)](https://pydantic.dev/docs/validation/latest/get-started/why/#org-google "Google")

[![HSBC](https://pydantic.dev/docs/validation/logos/hsbc_logo.png)](https://pydantic.dev/docs/validation/latest/get-started/why/#org-hsbc "HSBC")

[![IBM](https://pydantic.dev/docs/validation/logos/ibm_logo.png)](https://pydantic.dev/docs/validation/latest/get-started/why/#org-ibm "IBM")

[![Intel](https://pydantic.dev/docs/validation/logos/intel_logo.png)](https://pydantic.dev/docs/validation/latest/get-started/why/#org-intel "Intel")

[![Intuit](https://pydantic.dev/docs/validation/logos/intuit_logo.png)](https://pydantic.dev/docs/validation/latest/get-started/why/#org-intuit "Intuit")

[![Intergovernmental Panel on Climate Change](https://pydantic.dev/docs/validation/logos/ipcc_logo.png)](https://pydantic.dev/docs/validation/latest/get-started/why/#org-ipcc "Intergovernmental Panel on Climate Change")

[![JPMorgan](https://pydantic.dev/docs/validation/logos/jpmorgan_logo.png)](https://pydantic.dev/docs/validation/latest/get-started/why/#org-jpmorgan "JPMorgan")

[![Jupyter](https://pydantic.dev/docs/validation/logos/jupyter_logo.png)](https://pydantic.dev/docs/validation/latest/get-started/why/#org-jupyter "Jupyter")

[![Microsoft](https://pydantic.dev/docs/validation/logos/microsoft_logo.png)](https://pydantic.dev/docs/validation/latest/get-started/why/#org-microsoft "Microsoft")

[![Molecular Science Software Institute](https://pydantic.dev/docs/validation/logos/molssi_logo.png)](https://pydantic.dev/docs/validation/latest/get-started/why/#org-molssi "Molecular Science Software Institute")

[![NASA](https://pydantic.dev/docs/validation/logos/nasa_logo.png)](https://pydantic.dev/docs/validation/latest/get-started/why/#org-nasa "NASA")

[![Netflix](https://pydantic.dev/docs/validation/logos/netflix_logo.png)](https://pydantic.dev/docs/validation/latest/get-started/why/#org-netflix "Netflix")

[![NSA](https://pydantic.dev/docs/validation/logos/nsa_logo.png)](https://pydantic.dev/docs/validation/latest/get-started/why/#org-nsa "NSA")

[![NVIDIA](https://pydantic.dev/docs/validation/logos/nvidia_logo.png)](https://pydantic.dev/docs/validation/latest/get-started/why/#org-nvidia "NVIDIA")

[![OpenAI](https://pydantic.dev/docs/validation/logos/openai_logo.png)](https://pydantic.dev/docs/validation/latest/get-started/why/#org-openai "OpenAI")

[![Oracle](https://pydantic.dev/docs/validation/logos/oracle_logo.png)](https://pydantic.dev/docs/validation/latest/get-started/why/#org-oracle "Oracle")

[![Palantir](https://pydantic.dev/docs/validation/logos/palantir_logo.png)](https://pydantic.dev/docs/validation/latest/get-started/why/#org-palantir "Palantir")

[![Qualcomm](https://pydantic.dev/docs/validation/logos/qualcomm_logo.png)](https://pydantic.dev/docs/validation/latest/get-started/why/#org-qualcomm "Qualcomm")

[![Red Hat](https://pydantic.dev/docs/validation/logos/redhat_logo.png)](https://pydantic.dev/docs/validation/latest/get-started/why/#org-redhat "Red Hat")

[![Revolut](https://pydantic.dev/docs/validation/logos/revolut_logo.png)](https://pydantic.dev/docs/validation/latest/get-started/why/#org-revolut "Revolut")

[![Robusta](https://pydantic.dev/docs/validation/logos/robusta_logo.png)](https://pydantic.dev/docs/validation/latest/get-started/why/#org-robusta "Robusta")

[![Salesforce](https://pydantic.dev/docs/validation/logos/salesforce_logo.png)](https://pydantic.dev/docs/validation/latest/get-started/why/#org-salesforce "Salesforce")

[![Starbucks](https://pydantic.dev/docs/validation/logos/starbucks_logo.png)](https://pydantic.dev/docs/validation/latest/get-started/why/#org-starbucks "Starbucks")

[![Texas Instruments](https://pydantic.dev/docs/validation/logos/ti_logo.png)](https://pydantic.dev/docs/validation/latest/get-started/why/#org-ti "Texas Instruments")

[![Twilio](https://pydantic.dev/docs/validation/logos/twilio_logo.png)](https://pydantic.dev/docs/validation/latest/get-started/why/#org-twilio "Twilio")

[![Twitter](https://pydantic.dev/docs/validation/logos/twitter_logo.png)](https://pydantic.dev/docs/validation/latest/get-started/why/#org-twitter "Twitter")

[![UK Home Office](https://pydantic.dev/docs/validation/logos/ukhomeoffice_logo.png)](https://pydantic.dev/docs/validation/latest/get-started/why/#org-ukhomeoffice "UK Home Office")

For a more comprehensive list of open-source projects using Pydantic see the
[list of dependents on github](https://github.com/pydantic/pydantic/network/dependents), or you can find some awesome projects using Pydantic in [awesome-pydantic](https://github.com/Kludex/awesome-pydantic).

Was this page helpful?

Thanks for your feedback!