import { useRef, useState, type FormEvent } from 'react'
import {
  ApiError,
  createSchedule,
  type CargoCategory,
  type CargoItemInput,
  type DriverDocumentType,
  type ScheduleOut,
} from '../services/api'
import { fetchCitiesByState, type CityOption } from '../services/locations'
import {
  CHASSIS_LENGTH,
  CPF_LENGTH,
  cargoCategoryLabel,
  driverDocumentHint,
  driverDocumentTypeLabel,
  formatScheduledDate,
  isDriverDocumentTooShortToJudge,
  isValidDriverDocument,
  sanitizeChassis,
  sanitizeDriverDocument,
} from '../services/plate'
import StatusMessage from './StatusMessage'

const MAX_PLATE_LENGTH = 8

const CARGO_CATEGORIES: CargoCategory[] = ['perecivel', 'nao_perecivel', 'quimico', 'toxico', 'inflamavel']
const DOCUMENT_TYPES: DriverDocumentType[] = ['cpf', 'rg', 'cnh']
const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB',
  'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]

interface ScheduleFormProps {
  idPrefix?: string
  initialPlate?: string
  initialScheduledDate?: string
  plateReadOnly?: boolean
  onCreated: (schedule: ScheduleOut) => void
}

function emptyCargoItem(): CargoItemInput {
  return { productName: '', category: 'nao_perecivel' }
}

export default function ScheduleForm({
  idPrefix = 'schedule',
  initialPlate = '',
  initialScheduledDate = '',
  plateReadOnly = false,
  onCreated,
}: ScheduleFormProps) {
  const [plate, setPlate] = useState(initialPlate)
  const [driverName, setDriverName] = useState('')
  const [driverBirthDate, setDriverBirthDate] = useState('')
  const [driverBirthPlace, setDriverBirthPlace] = useState('')
  const [driverBirthState, setDriverBirthState] = useState('')
  const [birthCities, setBirthCities] = useState<CityOption[]>([])
  const [loadingBirthCities, setLoadingBirthCities] = useState(false)
  const [birthCitiesError, setBirthCitiesError] = useState<string | null>(null)
  const [driverDocumentType, setDriverDocumentType] = useState<DriverDocumentType>('cpf')
  const [driverDocument, setDriverDocument] = useState('')
  const [vehicleBrand, setVehicleBrand] = useState('')
  const [vehicleModel, setVehicleModel] = useState('')
  const [vehicleYear, setVehicleYear] = useState('')
  const [vehicleChassis, setVehicleChassis] = useState('')
  const [vehicleColor, setVehicleColor] = useState('')
  const [vehicleLengthM, setVehicleLengthM] = useState('')
  const [vehicleHeightM, setVehicleHeightM] = useState('')
  const [vehicleWidthM, setVehicleWidthM] = useState('')
  const [originLocation, setOriginLocation] = useState('')
  const [destinationLocation, setDestinationLocation] = useState('')
  const [cargoItems, setCargoItems] = useState<CargoItemInput[]>([emptyCargoItem()])
  const [scheduledDate, setScheduledDate] = useState(initialScheduledDate)
  const [driverDocumentPhotoFront, setDriverDocumentPhotoFront] = useState<File | null>(null)
  const [driverDocumentPhotoBack, setDriverDocumentPhotoBack] = useState<File | null>(null)
  const [vehicleDocumentPhoto, setVehicleDocumentPhoto] = useState<File | null>(null)
  const [manifestPhoto, setManifestPhoto] = useState<File | null>(null)
  const [sending, setSending] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [created, setCreated] = useState<string | null>(null)

  const latestBirthStateRequest = useRef<string | null>(null)

  function handleDriverBirthStateChange(value: string) {
    setDriverBirthState(value)
    setDriverBirthPlace('')
    setBirthCities([])
    setBirthCitiesError(null)
    latestBirthStateRequest.current = value
    if (!value) return
    setLoadingBirthCities(true)
    fetchCitiesByState(value)
      .then((cities) => {
        if (latestBirthStateRequest.current === value) setBirthCities(cities)
      })
      .catch(() => {
        if (latestBirthStateRequest.current === value) {
          setBirthCitiesError('Não foi possível carregar as cidades dessa UF. Tente escolher a UF de novo.')
        }
      })
      .finally(() => {
        if (latestBirthStateRequest.current === value) setLoadingBirthCities(false)
      })
  }

  function updateCargoItem(index: number, changes: Partial<CargoItemInput>) {
    setCargoItems((current) => current.map((item, i) => (i === index ? { ...item, ...changes } : item)))
  }

  function addCargoItem() {
    setCargoItems((current) => [...current, emptyCargoItem()])
  }

  function removeCargoItem(index: number) {
    setCargoItems((current) => current.filter((_, i) => i !== index))
  }

  const hasValidCargoItems = cargoItems.length > 0 && cargoItems.every((item) => item.productName.trim())
  const isDriverDocumentValid = isValidDriverDocument(driverDocumentType, driverDocument)
  const canSubmit =
    Boolean(plate) &&
    Boolean(driverName) &&
    Boolean(driverBirthDate) &&
    Boolean(driverBirthPlace) &&
    Boolean(driverBirthState) &&
    isDriverDocumentValid &&
    Boolean(vehicleBrand) &&
    Boolean(vehicleModel) &&
    Boolean(vehicleYear) &&
    Boolean(vehicleChassis) &&
    Boolean(vehicleColor) &&
    Boolean(vehicleLengthM) &&
    Boolean(vehicleHeightM) &&
    Boolean(vehicleWidthM) &&
    Boolean(originLocation) &&
    Boolean(destinationLocation) &&
    Boolean(scheduledDate) &&
    hasValidCargoItems &&
    Boolean(driverDocumentPhotoFront) &&
    Boolean(driverDocumentPhotoBack) &&
    Boolean(vehicleDocumentPhoto) &&
    Boolean(manifestPhoto)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!driverDocumentPhotoFront || !driverDocumentPhotoBack || !vehicleDocumentPhoto || !manifestPhoto) return
    setSending(true)
    setFormError(null)
    setCreated(null)
    try {
      const schedule = await createSchedule({
        plate,
        driverName,
        driverBirthDate,
        driverBirthPlace,
        driverBirthState,
        driverDocumentType,
        driverDocument,
        vehicleBrand,
        vehicleModel,
        vehicleYear,
        vehicleChassis,
        vehicleColor,
        vehicleLengthM,
        vehicleHeightM,
        vehicleWidthM,
        originLocation,
        destinationLocation,
        cargoItems,
        scheduledDate,
        driverDocumentPhotoFront,
        driverDocumentPhotoBack,
        vehicleDocumentPhoto,
        manifestPhoto,
      })
      setCreated(`Agendamento da placa ${schedule.plate} cadastrado para ${formatScheduledDate(schedule.scheduled_date)}.`)
      setDriverName('')
      setDriverBirthDate('')
      setDriverBirthPlace('')
      setDriverBirthState('')
      setBirthCities([])
      setBirthCitiesError(null)
      latestBirthStateRequest.current = null
      setDriverDocument('')
      setVehicleBrand('')
      setVehicleModel('')
      setVehicleYear('')
      setVehicleChassis('')
      setVehicleColor('')
      setVehicleLengthM('')
      setVehicleHeightM('')
      setVehicleWidthM('')
      setOriginLocation('')
      setDestinationLocation('')
      setCargoItems([emptyCargoItem()])
      setDriverDocumentPhotoFront(null)
      setDriverDocumentPhotoBack(null)
      setVehicleDocumentPhoto(null)
      setManifestPhoto(null)
      if (!plateReadOnly) setPlate('')
      onCreated(schedule)
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Erro inesperado ao cadastrar o agendamento.')
    } finally {
      setSending(false)
    }
  }

  return (
    <form className="form schedule-form" onSubmit={handleSubmit}>
      <label htmlFor={`${idPrefix}-plate`}>Placa</label>
      <input
        id={`${idPrefix}-plate`}
        type="text"
        autoComplete="off"
        maxLength={MAX_PLATE_LENGTH}
        value={plate}
        onChange={(event) => setPlate(event.target.value.toUpperCase())}
        disabled={sending || plateReadOnly}
      />

      <h3 className="form-section">Motorista</h3>
      <label htmlFor={`${idPrefix}-driver-name`}>Nome do motorista</label>
      <input
        id={`${idPrefix}-driver-name`}
        type="text"
        autoComplete="off"
        value={driverName}
        onChange={(event) => setDriverName(event.target.value)}
        disabled={sending}
      />

      <label htmlFor={`${idPrefix}-driver-birth-date`}>Data de nascimento</label>
      <input
        id={`${idPrefix}-driver-birth-date`}
        type="date"
        value={driverBirthDate}
        onChange={(event) => setDriverBirthDate(event.target.value)}
        disabled={sending}
      />

      <div className="field-row">
        <div className="field-row-item field-row-item-narrow">
          <label htmlFor={`${idPrefix}-driver-birth-state`}>UF</label>
          <select
            id={`${idPrefix}-driver-birth-state`}
            value={driverBirthState}
            onChange={(event) => handleDriverBirthStateChange(event.target.value)}
            disabled={sending}
          >
            <option value="" disabled>
              UF
            </option>
            {UFS.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </select>
        </div>
        <div className="field-row-item">
          <label htmlFor={`${idPrefix}-driver-birth-place`}>Local de nascimento (cidade)</label>
          <select
            id={`${idPrefix}-driver-birth-place`}
            value={driverBirthPlace}
            onChange={(event) => setDriverBirthPlace(event.target.value)}
            disabled={sending || !driverBirthState || loadingBirthCities || birthCities.length === 0}
          >
            <option value="" disabled>
              {loadingBirthCities
                ? 'Carregando cidades…'
                : !driverBirthState
                  ? 'Escolha a UF primeiro'
                  : 'Selecione a cidade'}
            </option>
            {birthCities.map((city) => (
              <option key={city.id} value={city.name}>
                {city.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {birthCitiesError && <StatusMessage tone="error">{birthCitiesError}</StatusMessage>}

      <label htmlFor={`${idPrefix}-driver-document-type`}>Tipo de documento</label>
      <select
        id={`${idPrefix}-driver-document-type`}
        value={driverDocumentType}
        onChange={(event) => {
          const type = event.target.value as DriverDocumentType
          setDriverDocumentType(type)
          setDriverDocument((current) => sanitizeDriverDocument(current, type))
        }}
        disabled={sending}
      >
        {DOCUMENT_TYPES.map((type) => (
          <option key={type} value={type}>
            {driverDocumentTypeLabel(type)}
          </option>
        ))}
      </select>

      <label htmlFor={`${idPrefix}-driver-document`}>Número do documento</label>
      <input
        id={`${idPrefix}-driver-document`}
        type="text"
        inputMode={driverDocumentType === 'rg' ? 'text' : 'numeric'}
        autoComplete="off"
        maxLength={CPF_LENGTH}
        value={driverDocument}
        onChange={(event) => setDriverDocument(sanitizeDriverDocument(event.target.value, driverDocumentType))}
        disabled={sending}
      />
      <p className="hint">{driverDocumentHint(driverDocumentType)}</p>
      {driverDocument.length > 0 &&
        !isDriverDocumentValid &&
        !isDriverDocumentTooShortToJudge(driverDocumentType, driverDocument) && (
          <StatusMessage tone="review">Documento inválido — confira o número digitado.</StatusMessage>
        )}

      <label htmlFor={`${idPrefix}-driver-photo-front`}>Foto da frente do documento do motorista</label>
      <input
        id={`${idPrefix}-driver-photo-front`}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(event) => setDriverDocumentPhotoFront(event.target.files?.[0] ?? null)}
        disabled={sending}
      />

      <label htmlFor={`${idPrefix}-driver-photo-back`}>Foto do verso do documento do motorista</label>
      <input
        id={`${idPrefix}-driver-photo-back`}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(event) => setDriverDocumentPhotoBack(event.target.files?.[0] ?? null)}
        disabled={sending}
      />
      <p className="hint">Frente e verso, para conferência do documento na guarita.</p>

      <h3 className="form-section">Veículo</h3>
      <label htmlFor={`${idPrefix}-vehicle-brand`}>Marca do veículo</label>
      <input
        id={`${idPrefix}-vehicle-brand`}
        type="text"
        autoComplete="off"
        value={vehicleBrand}
        onChange={(event) => setVehicleBrand(event.target.value)}
        disabled={sending}
      />

      <label htmlFor={`${idPrefix}-vehicle-model`}>Modelo do veículo</label>
      <input
        id={`${idPrefix}-vehicle-model`}
        type="text"
        autoComplete="off"
        value={vehicleModel}
        onChange={(event) => setVehicleModel(event.target.value)}
        disabled={sending}
      />

      <label htmlFor={`${idPrefix}-vehicle-year`}>Ano do veículo</label>
      <input
        id={`${idPrefix}-vehicle-year`}
        type="text"
        inputMode="numeric"
        maxLength={4}
        autoComplete="off"
        value={vehicleYear}
        onChange={(event) => setVehicleYear(event.target.value)}
        disabled={sending}
      />

      <label htmlFor={`${idPrefix}-vehicle-chassis`}>Chassi</label>
      <input
        id={`${idPrefix}-vehicle-chassis`}
        type="text"
        autoComplete="off"
        maxLength={CHASSIS_LENGTH}
        value={vehicleChassis}
        onChange={(event) => setVehicleChassis(sanitizeChassis(event.target.value))}
        disabled={sending}
      />
      <p className="hint">17 caracteres (letras e números) — espaços e símbolos são ignorados.</p>

      <label htmlFor={`${idPrefix}-vehicle-color`}>Cor do veículo</label>
      <input
        id={`${idPrefix}-vehicle-color`}
        type="text"
        autoComplete="off"
        value={vehicleColor}
        onChange={(event) => setVehicleColor(event.target.value)}
        disabled={sending}
      />

      <label htmlFor={`${idPrefix}-vehicle-length`}>Comprimento (m)</label>
      <input
        id={`${idPrefix}-vehicle-length`}
        type="number"
        step="0.01"
        min="0"
        value={vehicleLengthM}
        onChange={(event) => setVehicleLengthM(event.target.value)}
        disabled={sending}
      />

      <label htmlFor={`${idPrefix}-vehicle-height`}>Altura (m)</label>
      <input
        id={`${idPrefix}-vehicle-height`}
        type="number"
        step="0.01"
        min="0"
        value={vehicleHeightM}
        onChange={(event) => setVehicleHeightM(event.target.value)}
        disabled={sending}
      />

      <label htmlFor={`${idPrefix}-vehicle-width`}>Largura (m)</label>
      <input
        id={`${idPrefix}-vehicle-width`}
        type="number"
        step="0.01"
        min="0"
        value={vehicleWidthM}
        onChange={(event) => setVehicleWidthM(event.target.value)}
        disabled={sending}
      />

      <label htmlFor={`${idPrefix}-vehicle-photo`}>Foto do documento do veículo</label>
      <input
        id={`${idPrefix}-vehicle-photo`}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(event) => setVehicleDocumentPhoto(event.target.files?.[0] ?? null)}
        disabled={sending}
      />

      <h3 className="form-section">Rota</h3>
      <label htmlFor={`${idPrefix}-origin`}>Origem</label>
      <input
        id={`${idPrefix}-origin`}
        type="text"
        autoComplete="off"
        value={originLocation}
        onChange={(event) => setOriginLocation(event.target.value)}
        disabled={sending}
      />

      <label htmlFor={`${idPrefix}-destination`}>Destino</label>
      <input
        id={`${idPrefix}-destination`}
        type="text"
        autoComplete="off"
        value={destinationLocation}
        onChange={(event) => setDestinationLocation(event.target.value)}
        disabled={sending}
      />

      <h3 className="form-section">Carga</h3>
      <span className="label">Produtos da carga</span>
      {cargoItems.map((item, index) => (
        <div className="cargo-item-row" key={index}>
          <label htmlFor={`${idPrefix}-cargo-product-${index}`}>Produto {index + 1}</label>
          <input
            id={`${idPrefix}-cargo-product-${index}`}
            type="text"
            autoComplete="off"
            value={item.productName}
            onChange={(event) => updateCargoItem(index, { productName: event.target.value })}
            disabled={sending}
          />
          <label htmlFor={`${idPrefix}-cargo-category-${index}`}>Categoria</label>
          <select
            id={`${idPrefix}-cargo-category-${index}`}
            value={item.category}
            onChange={(event) => updateCargoItem(index, { category: event.target.value as CargoCategory })}
            disabled={sending}
          >
            {CARGO_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {cargoCategoryLabel(category)}
              </option>
            ))}
          </select>
          {cargoItems.length > 1 && (
            <button type="button" onClick={() => removeCargoItem(index)} disabled={sending}>
              Remover produto
            </button>
          )}
        </div>
      ))}
      <button type="button" onClick={addCargoItem} disabled={sending}>
        Adicionar produto
      </button>

      <label htmlFor={`${idPrefix}-date`}>Data prevista</label>
      <input
        id={`${idPrefix}-date`}
        type="date"
        value={scheduledDate}
        onChange={(event) => setScheduledDate(event.target.value)}
        disabled={sending}
      />

      <label htmlFor={`${idPrefix}-manifest-photo`}>Foto do manifesto de carga</label>
      <input
        id={`${idPrefix}-manifest-photo`}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(event) => setManifestPhoto(event.target.files?.[0] ?? null)}
        disabled={sending}
      />
      <p className="hint">
        As quatro fotos são obrigatórias. Use só dados de exemplo — nunca documentos reais.
      </p>

      {formError && (
        <p className="message error" role="alert" aria-live="assertive">
          {formError}
        </p>
      )}
      {created && (
        <p className="message" role="status" aria-live="polite">
          {created}
        </p>
      )}

      <button type="submit" className="primary" disabled={sending || !canSubmit}>
        {sending ? 'Cadastrando…' : 'Cadastrar'}
      </button>
    </form>
  )
}
